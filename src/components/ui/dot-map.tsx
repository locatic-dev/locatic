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

export function DotMap({ width = 800, height = 360, className }: DotMapProps) {
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

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ display: 'block', overflow: 'visible' }}
      aria-hidden
    >
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.x}
          cy={d.y}
          r={1.4}
          fill="var(--lx-text-3)"
          opacity={0.35}
        />
      ))}
      {ACTIVE_CITIES.map((c, i) => {
        const px = c.x * width
        const py = c.y * height
        const delay = `${i * 0.44}s`
        return (
          <g key={i}>
            {/* ping ring — SVG-native animate so it always works */}
            <circle cx={px} cy={py} r={3} fill="none" stroke="var(--lx-accent)" strokeWidth={1.2} opacity={0}>
              <animate attributeName="r" from="3" to="18" dur={DUR} begin={delay} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.6;0" dur={DUR} begin={delay} repeatCount="indefinite" />
            </circle>
            {/* glow halo */}
            <circle cx={px} cy={py} r={6} fill="var(--lx-accent)" opacity={0.18} />
            {/* solid dot */}
            <circle cx={px} cy={py} r={2.4} fill="var(--lx-accent)" />
          </g>
        )
      })}
    </svg>
  )
}
