import { useEffect, useRef } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

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
  loading?: boolean
  unavailable?: boolean
}

// Intensity ramp is opacity steps of the brand accent so it tracks the theme
// automatically instead of hardcoding a hue.
const CELL_COLORS = [
  'var(--lx-surface-alt)',
  'color-mix(in oklch, var(--lx-accent) 25%, transparent)',
  'color-mix(in oklch, var(--lx-accent) 50%, transparent)',
  'color-mix(in oklch, var(--lx-accent) 75%, transparent)',
  'var(--lx-accent)',
]

// Room for label-size (12px) month and weekday labels.
const MONTH_LABEL_HEIGHT = 18
const WEEKDAY_LABEL_WIDTH = 30
const WEEKDAY_LABELS: Record<number, string> = { 1: 'Mon', 3: 'Wed', 5: 'Fri' }
const MIN_MONTH_LABEL_GAP = 3

export function ContributionGraph({
  cell = 11,
  gap = 3,
  className,
  weeks,
  totalContributions,
  loading,
  unavailable,
}: ContributionGraphProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  // On narrow screens the graph scrolls instead of shrinking; open it on the
  // most recent weeks, which sit at the right edge. A no-op when it fits.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (scroller) {
      scroller.scrollLeft = scroller.scrollWidth
    }
  }, [weeks])

  if (loading) {
    return (
      <Skeleton
        className="h-20 rounded-md"
        aria-label="Loading GitHub contributions"
      />
    )
  }

  if (unavailable) {
    return (
      <p className="py-3 font-mono text-meta text-text-faint">
        contribution data is not available yet. If GitHub is already connected,
        check back after the next sync.
      </p>
    )
  }
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

  const monthLabels: Array<{ wi: number; label: string }> = []
  let lastLabeledWeek = -Infinity
  let lastMonth = -1
  for (const cellData of cells) {
    if (cellData.d !== 0 || !cellData.date) continue
    const monthDate = new Date(`${cellData.date}T00:00:00`)
    const month = monthDate.getMonth()
    if (
      month !== lastMonth &&
      cellData.w - lastLabeledWeek >= MIN_MONTH_LABEL_GAP
    ) {
      monthLabels.push({
        wi: cellData.w,
        label: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(
          monthDate,
        ),
      })
      lastLabeledWeek = cellData.w
      lastMonth = month
    } else if (month !== lastMonth) {
      lastMonth = month
    }
  }

  const gridW = 53 * (cell + gap)
  const gridH = 7 * (cell + gap)
  const W = WEEKDAY_LABEL_WIDTH + gridW
  const H = MONTH_LABEL_HEIGHT + gridH

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

  // Rendered at its intrinsic size (cells never shrink below `cell`); the
  // wrapper scrolls horizontally when the viewport is narrower than the graph.
  // It is focusable so keyboard users can scroll it too.
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div
        ref={scrollerRef}
        role="region"
        aria-label="GitHub contribution graph"
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The overflowing graph must remain keyboard-scrollable.
        tabIndex={0}
        className="max-w-full overflow-x-auto overscroll-x-contain"
      >
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          className={cn('block', className)}
          aria-label={
            totalContributions != null
              ? `${totalContributions} GitHub contributions in the last year`
              : 'GitHub contribution graph'
          }
        >
          {monthLabels.map(({ wi, label }) => (
            <text
              key={`month-${wi}`}
              x={WEEKDAY_LABEL_WIDTH + wi * (cell + gap)}
              y={MONTH_LABEL_HEIGHT - 5}
              className="fill-current font-mono text-label text-text-faint"
            >
              {label}
            </text>
          ))}
          {Object.entries(WEEKDAY_LABELS).map(([d, label]) => (
            <text
              key={`weekday-${d}`}
              x={0}
              y={MONTH_LABEL_HEIGHT + Number(d) * (cell + gap) + cell - 1}
              className="fill-current font-mono text-label text-text-faint"
            >
              {label}
            </text>
          ))}
          {cells.map(({ w, d, level, count, date }, i) => (
            <rect
              key={i}
              x={WEEKDAY_LABEL_WIDTH + w * (cell + gap)}
              y={MONTH_LABEL_HEIGHT + d * (cell + gap)}
              width={cell}
              height={cell}
              rx={3}
              fill={CELL_COLORS[level]}
            >
              <title>{formatTooltipLabel(count, date)}</title>
            </rect>
          ))}
        </svg>
      </div>
      {/* Intensity key; the per-day counts are in each cell's title. */}
      <div
        aria-hidden="true"
        className="flex items-center justify-end gap-1 font-mono text-meta text-text-faint"
      >
        <span className="mr-1">less</span>
        <svg width={CELL_COLORS.length * (cell + gap)} height={cell}>
          {CELL_COLORS.map((color, level) => (
            <rect
              key={color}
              x={level * (cell + gap)}
              width={cell}
              height={cell}
              rx={3}
              fill={color}
            />
          ))}
        </svg>
        <span className="ml-1">more</span>
      </div>
    </div>
  )
}
