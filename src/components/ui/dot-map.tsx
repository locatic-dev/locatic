import * as m from 'motion/react-m'
import type { Variants } from 'motion/react'
import { easeOutExpo, useReducedMotion } from '@/lib/motion'

interface DotMapProps {
  width?: number
  height?: number
  className?: string
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

const ACTIVE_CITIES = [
  { x: 0.18, y: 0.32, label: 'sf' },
  { x: 0.27, y: 0.28, label: 'ny' },
  { x: 0.46, y: 0.26, label: 'ldn' },
  { x: 0.51, y: 0.3, label: 'ber' },
  { x: 0.66, y: 0.46, label: 'blr' },
  { x: 0.78, y: 0.4, label: 'tyo' },
  { x: 0.3, y: 0.7, label: 'sao' },
]

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

export function DotMap({ width = 800, height = 360, className }: DotMapProps) {
  const reducedMotion = useReducedMotion()
  const dots: Array<{ x: number; y: number }> = []
  const cx = width / LAND_MASK[0].length
  const cy = height / LAND_MASK.length

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
      aria-hidden
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
      {ACTIVE_CITIES.map((c, i) => {
        const px = c.x * width
        const py = c.y * height
        const delay = `${i * 0.44}s`
        return (
          <m.g
            key={i}
            custom={i}
            variants={pinVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Keep this subtree SSR-stable. CSS hides the SMIL ping for
                reduced-motion users without changing the hydrated SVG tree. */}
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
