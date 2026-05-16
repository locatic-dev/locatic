interface ContributionGraphProps {
  cell?: number
  gap?: number
  className?: string
}

export function ContributionGraph({
  cell = 10,
  gap = 2,
  className,
}: ContributionGraphProps) {
  const cells: Array<{ w: number; d: number; level: number }> = []

  for (let w = 0; w < 53; w++) {
    for (let d = 0; d < 7; d++) {
      const r = (((w * 7 + d) * 9301 + 49297) % 233280) / 233280
      const recency = w / 53
      const weekday = d > 0 && d < 6 ? 1 : 0.4
      const score = r * 1.5 * weekday * (0.5 + recency * 0.6)
      let level = 0
      if (score > 0.3) level = 1
      if (score > 0.55) level = 2
      if (score > 0.8) level = 3
      if (score > 1.05) level = 4
      cells.push({ w, d, level })
    }
  }

  const W = 53 * (cell + gap)
  const H = 7 * (cell + gap)

  const colors = [
    'var(--lx-surface-alt)',
    'oklch(72% 0.17 185 / 0.25)',
    'oklch(72% 0.17 185 / 0.5)',
    'oklch(72% 0.17 185 / 0.75)',
    'var(--lx-accent)',
  ]

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      style={{ display: 'block', maxWidth: '100%' }}
      aria-label="GitHub contribution graph"
    >
      {cells.map(({ w, d, level }, i) => (
        <rect
          key={i}
          x={w * (cell + gap)}
          y={d * (cell + gap)}
          width={cell}
          height={cell}
          rx={2}
          fill={colors[level]}
        />
      ))}
    </svg>
  )
}
