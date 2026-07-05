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

  const dotColor = isMuted ? 'var(--lx-text-2)' : `hsl(${s.hue} 70% 60%)`
  const textColor = isMuted ? 'var(--lx-text-2)' : `hsl(${s.hue} 60% 70%)`
  const bg = isMuted
    ? 'color-mix(in oklch, var(--lx-text-2) 8%, transparent)'
    : `hsl(${s.hue} 60% 50% / 0.1)`
  const border = isMuted
    ? 'color-mix(in oklch, var(--lx-text-2) 20%, transparent)'
    : `hsl(${s.hue} 60% 50% / 0.25)`

  return (
    <span
      className={[
        'inline-flex max-w-full items-center gap-[5px] rounded-[3px] border font-mono leading-none',
        size === 'sm'
          ? 'min-h-[22px] px-[7px] py-1 text-[10.5px]'
          : 'min-h-7 px-[9px] py-[5px] text-[11.5px]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        color: textColor,
        background: bg,
        borderColor: border,
      }}
    >
      <span
        className="size-[5px] shrink-0 rounded-full"
        style={{
          background: dotColor,
        }}
        aria-hidden
      />
      {s.label}
    </span>
  )
}
