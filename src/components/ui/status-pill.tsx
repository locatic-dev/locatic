/**
 * `hue` is an OKLCH hue; lightness and chroma come from the `--lx-status-l`
 * and `--lx-status-c` tokens in styles.css, so every status reads at the same
 * weight in all three themes.
 */
export const BUILD_STATUS = {
  building_solo: { label: 'building solo', hue: 230 },
  looking_for_cofounder: { label: 'looking for cofounder', hue: 305 },
  open_to_collab: { label: 'open to collab', hue: 150, accent: true },
  hiring: { label: 'hiring / building a team', hue: 65 },
  just_exploring: { label: 'just exploring', hue: 0, muted: true },
} as const

export type BuildStatus = keyof typeof BUILD_STATUS

/** Statuses that invite someone in; project cards show only these. */
const COLLABORATION_STATUSES: ReadonlySet<string> = new Set<BuildStatus>([
  'open_to_collab',
  'looking_for_cofounder',
  'hiring',
])

export function isCollaborationStatus(
  status: string | null | undefined,
): status is BuildStatus {
  return typeof status === 'string' && COLLABORATION_STATUSES.has(status)
}

interface StatusPillProps {
  status: BuildStatus | (string & {})
  size?: 'sm' | 'md'
  className?: string
}

export function StatusPill({
  status,
  size = 'sm',
  className,
}: StatusPillProps) {
  const s = BUILD_STATUS[status as BuildStatus] ?? {
    label: status,
    hue: BUILD_STATUS.building_solo.hue,
  }
  const isMuted = 'muted' in s && s.muted

  const color = isMuted
    ? 'var(--lx-text-2)'
    : `oklch(var(--lx-status-l) var(--lx-status-c) ${s.hue})`
  const bg = `color-mix(in oklch, ${color} ${isMuted ? 8 : 10}%, transparent)`
  const border = `color-mix(in oklch, ${color} ${isMuted ? 20 : 25}%, transparent)`

  return (
    <span
      className={[
        'inline-flex max-w-full items-center gap-[5px] rounded-control border font-mono leading-none',
        size === 'sm'
          ? 'min-h-[22px] px-[7px] py-1 text-meta'
          : 'min-h-7 px-[9px] py-[5px] text-label',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        color,
        background: bg,
        borderColor: border,
      }}
    >
      <span
        className="size-[5px] shrink-0 rounded-full"
        style={{
          background: color,
        }}
        aria-hidden
      />
      {s.label}
    </span>
  )
}
