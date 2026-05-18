interface ContributionWeek {
  days: Array<{ date: string; count: number }>
}

interface ContributionCell {
  count: number
  date: string | null
  level: number
  w: number
  d: number
}

interface ContributionGraphProps {
  cell?: number
  gap?: number
  className?: string
  weeks?: ContributionWeek[]
  totalContributions?: number
}

export function ContributionGraph({
  cell = 10,
  gap = 2,
  className,
  weeks,
  totalContributions,
}: ContributionGraphProps) {
  const cells: ContributionCell[] = []

  if (weeks && weeks.length > 0) {
    const maxCount = Math.max(
      ...weeks.flatMap((w) => w.days.map((d) => d.count)),
      1,
    )
    let wi = 0
    for (const week of weeks.slice(-53)) {
      for (let di = 0; di < week.days.length; di++) {
        const count = week.days[di]?.count ?? 0
        const date = week.days[di]?.date ?? null
        const ratio = count / maxCount
        let level = 0
        if (count > 0) level = 1
        if (ratio > 0.25) level = 2
        if (ratio > 0.5) level = 3
        if (ratio > 0.75) level = 4
        cells.push({ w: wi, d: di, level, count, date })
      }
      wi++
    }
    while (wi < 53) {
      for (let di = 0; di < 7; di++) {
        cells.push({ w: wi, d: di, level: 0, count: 0, date: null })
      }
      wi++
    }
  } else {
    for (let w = 0; w < 53; w++) {
      for (let d = 0; d < 7; d++) {
        cells.push({ w, d, level: 0, count: 0, date: null })
      }
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

  const formatTooltipLabel = (count: number, date: string | null) => {
    if (!date) {
      return 'No contributions'
    }

    const formattedDate = new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${date}T00:00:00`))

    const contributionLabel =
      count === 1 ? '1 contribution' : `${count.toLocaleString()} contributions`

    return `${contributionLabel} on ${formattedDate}`
  }

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className={
        className ? `block max-w-full ${className}` : 'block max-w-full'
      }
      aria-label={
        totalContributions != null
          ? `${totalContributions} GitHub contributions in the last year`
          : 'GitHub contribution graph'
      }
    >
      {cells.map(({ w, d, level, count, date }, i) => (
        <rect
          key={i}
          x={w * (cell + gap)}
          y={d * (cell + gap)}
          width={cell}
          height={cell}
          rx={2}
          fill={colors[level]}
        >
          <title>{formatTooltipLabel(count, date)}</title>
        </rect>
      ))}
    </svg>
  )
}
