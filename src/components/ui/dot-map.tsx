import * as m from 'motion/react-m'
import type { Variants } from 'motion/react'
import { projectEquirectangular, type LatLng } from '@/lib/geo'
import { easeOutExpo, useReducedMotion } from '@/lib/motion'

/** A place to plot, by latitude and longitude. */
export interface DotMapPoint extends LatLng {
  /** Stable key for the point, e.g. a city slug. */
  id: string
}

interface DotMapProps {
  width?: number
  height?: number
  className?: string
  /**
   * Places to plot (plan item D5), snapped to the land-mask dot they fall
   * on. When neither `points` nor `focus` is given the map shows the
   * landing's illustrative example pins.
   */
  points?: ReadonlyArray<DotMapPoint>
  /** The place the map is about: drawn with the ping and halo. */
  focus?: DotMapPoint | null
  /**
   * Accessible summary. Without it the map is decorative (`aria-hidden`);
   * pages that plot data list the same places as text beside it.
   */
  label?: string
}

const LAND_MASK = [
  '0000000111111100000000000111110000000000000',
  '0000011111111111000000011111111000000111100',
  '0000111111111111110011111111111000001111110',
  '0000111111111111100111111111111111111111110',
  '0001111111111110000011111111111111111111100',
  '0001111111110000000011111111111111111110000',
  '0011111111100000000111111111110011111100000',
  '0001111111000000000011111111100001111100000',
  '0000111100000000000001111111000000111000000',
  '0000111000000000000000111111000000110000000',
  '0000110000000000000000111110000000010000000',
  '0000010000000000000000011110000000010000000',
  '0000000000000000000000011000000000000000000',
  '0000000000000000000000000000000000111100000',
  '0000000000000000000000000000000000111000000',
]

const MASK_COLUMNS = LAND_MASK[0].length
const MASK_ROWS = LAND_MASK.length

/**
 * The equirectangular box the hand-drawn mask covers. The mask is a coarse
 * sketch, not a true projection; this is the box that puts the most
 * reference cities on land (Northern Hemisphere cities, Bengaluru included,
 * land on the right continent; the sketch draws South America and
 * Australia too far west and south to fit any single box).
 */
const MASK_BOUNDS = { west: -180, east: 160, north: 75, south: -65 }

/** Illustrative pins for the landing, as fractions of the map. */
const EXAMPLE_PINS = [
  { x: 0.18, y: 0.32, key: 'sf' },
  { x: 0.27, y: 0.28, key: 'ny' },
  { x: 0.46, y: 0.26, key: 'ldn' },
  { x: 0.51, y: 0.3, key: 'ber' },
  { x: 0.66, y: 0.46, key: 'blr' },
  { x: 0.78, y: 0.4, key: 'tyo' },
  { x: 0.3, y: 0.7, key: 'sao' },
]

/** The land-mask cell a location projects onto. */
export function projectToMaskCell(location: LatLng): {
  row: number
  col: number
} {
  const { x, y } = projectEquirectangular(location, MASK_BOUNDS)
  return {
    row: Math.min(Math.floor(y * MASK_ROWS), MASK_ROWS - 1),
    col: Math.min(Math.floor(x * MASK_COLUMNS), MASK_COLUMNS - 1),
  }
}

/** Whether a mask cell is drawn as land. */
export function isMaskLandCell(cell: { row: number; col: number }): boolean {
  return LAND_MASK[cell.row]?.[cell.col] === '1'
}

/** Centre of the mask cell a location falls in, as fractions of the map. */
function toMaskFraction(location: LatLng) {
  const { row, col } = projectToMaskCell(location)
  return { x: (col + 0.5) / MASK_COLUMNS, y: (row + 0.5) / MASK_ROWS }
}

type Pin = { x: number; y: number; key: string; ping: boolean }

function getPins(
  points: DotMapProps['points'],
  focus: DotMapProps['focus'],
): Pin[] {
  if (points === undefined && focus === undefined) {
    return EXAMPLE_PINS.map((pin) => ({ ...pin, ping: true }))
  }
  // Focus last so it draws above neighbours that share its dot.
  return [
    ...(points ?? []).map((point) => ({
      ...toMaskFraction(point),
      key: point.id,
      ping: false,
    })),
    ...(focus ? [{ ...toMaskFraction(focus), key: focus.id, ping: true }] : []),
  ]
}

const DUR = '2.6s'

// Entrance for each city pin: drop + fade, staggered by index. MotionConfig
// (reducedMotion="user") auto-disables this since it only touches
// transform/opacity.
const pinVariants: Variants = {
  hidden: { y: -8 },
  visible: (i: number) => ({
    y: 0,
    transition: { delay: 0.15 + i * 0.09, duration: 0.42, ease: easeOutExpo },
  }),
}

// Sparse subset of background dots that get a slow "activity" breathing
// pulse — kept small (~8 nodes) so it stays cheap.
function pickPulseDotIndices(total: number, count: number) {
  if (total === 0) {
    return []
  }
  const step = Math.max(1, Math.floor(total / count))
  const indices: number[] = []
  for (let i = 0; i < total && indices.length < count; i += step) {
    indices.push(i)
  }
  return indices
}

export function DotMap({
  width = 800,
  height = 360,
  className,
  points,
  focus,
  label,
}: DotMapProps) {
  const reducedMotion = useReducedMotion()
  const dots: Array<{ x: number; y: number }> = []
  const cx = width / MASK_COLUMNS
  const cy = height / MASK_ROWS
  const pins = getPins(points, focus)

  for (let r = 0; r < LAND_MASK.length; r++) {
    for (let c = 0; c < LAND_MASK[r].length; c++) {
      if (LAND_MASK[r][c] === '1') {
        dots.push({ x: c * cx + cx / 2, y: r * cy + cy / 2 })
      }
    }
  }

  const pulseIndices = new Set(pickPulseDotIndices(dots.length, 8))

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ display: 'block', overflow: 'visible' }}
      {...(label
        ? { role: 'img', 'aria-label': label }
        : { 'aria-hidden': true })}
    >
      {dots.map((d, i) => {
        if (!pulseIndices.has(i)) {
          return (
            <circle
              key={i}
              cx={d.x}
              cy={d.y}
              r={1.4}
              fill="var(--lx-text-3)"
              opacity={0.35}
            />
          )
        }

        return (
          <m.circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={1.4}
            fill="var(--lx-text-3)"
            initial={{ opacity: 0.35, scale: 1 }}
            animate={
              reducedMotion
                ? { opacity: 0.35, scale: 1 }
                : { opacity: [0.35, 0.75, 0.35], scale: [1, 1.6, 1] }
            }
            transition={{
              duration: 3.2,
              delay: (i % 8) * 0.35,
              repeat: reducedMotion ? 0 : Infinity,
              ease: 'easeInOut',
            }}
            style={{ transformOrigin: `${d.x}px ${d.y}px` }}
          />
        )
      })}
      {pins.map((pin, i) => {
        const px = pin.x * width
        const py = pin.y * height
        const delay = `${i * 0.44}s`
        return (
          <m.g
            key={pin.key}
            custom={i}
            variants={pinVariants}
            initial="hidden"
            animate="visible"
            data-map-pin={pin.key}
          >
            {/* Keep this subtree SSR-stable. CSS hides the SMIL ping for
                reduced-motion users without changing the hydrated SVG tree. */}
            {pin.ping && (
              <g className="lx-dot-map-ping">
                <circle
                  cx={px}
                  cy={py}
                  r={3}
                  fill="none"
                  stroke="var(--lx-accent)"
                  strokeWidth={1.2}
                  opacity={0}
                >
                  <animate
                    attributeName="r"
                    from="3"
                    to="18"
                    dur={DUR}
                    begin={delay}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.6;0"
                    dur={DUR}
                    begin={delay}
                    repeatCount="indefinite"
                  />
                </circle>
              </g>
            )}
            {/* glow halo */}
            <circle
              cx={px}
              cy={py}
              r={6}
              fill="var(--lx-accent)"
              opacity={0.18}
            />
            {/* solid dot */}
            <circle cx={px} cy={py} r={2.4} fill="var(--lx-accent)" />
          </m.g>
        )
      })}
    </svg>
  )
}
