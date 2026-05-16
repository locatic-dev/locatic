export const BUILD_STATUS = {
  building_solo: { label: 'building solo', hue: 200 },
  looking_for_cofounder: { label: 'looking for cofounder', hue: 280 },
  open_to_collab: { label: 'open to collab', hue: 145, accent: true },
  hiring: { label: 'hiring / building a team', hue: 35 },
  just_exploring: { label: 'just exploring', hue: 0, muted: true },
} as const

export type BuildStatus = keyof typeof BUILD_STATUS

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
  const s = BUILD_STATUS[status as BuildStatus] ?? { label: status, hue: 200 }
  const isMuted = 'muted' in s && s.muted

  const baseStyle =
    size === 'sm'
      ? { fontSize: 10.5, padding: '2px 7px', height: 18 }
      : { fontSize: 11.5, padding: '3px 9px', height: 22 }

  const dotColor = isMuted ? '#8b949e' : `hsl(${s.hue} 70% 60%)`
  const textColor = isMuted ? '#8b949e' : `hsl(${s.hue} 60% 70%)`
  const bg = isMuted ? 'rgba(139,148,158,0.08)' : `hsl(${s.hue} 60% 50% / 0.1)`
  const border = isMuted
    ? 'rgba(139,148,158,0.2)'
    : `hsl(${s.hue} 60% 50% / 0.25)`

  return (
    <span
      className={className}
      style={{
        ...baseStyle,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        borderRadius: 3,
        fontFamily: 'var(--lx-font-mono)',
        color: textColor,
        background: bg,
        border: `1px solid ${border}`,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: dotColor,
          flexShrink: 0,
        }}
        aria-hidden
      />
      {s.label}
    </span>
  )
}
