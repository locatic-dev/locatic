import { LxAvatar } from '@/components/ui/lx-avatar'
import type { BuilderPreview } from '@/features/explore/types'

export function NearbyBuilderRow({
  builder,
  compact = false,
  onOpenProfile,
  onFollow,
  onMessage,
  followed,
  followPending,
  messagePending,
  isSelf,
}: {
  builder: BuilderPreview
  compact?: boolean
  onOpenProfile: () => void
  onFollow: () => void
  onMessage?: () => void
  followed: boolean
  followPending: boolean
  messagePending?: boolean
  isSelf?: boolean
}) {
  const metadata = (
    <>
      @{builder.githubUsername}
      {isSelf ? ' · you' : ''}
      {builder.cityName ? ` · ${builder.cityName}` : ''}
    </>
  )

  if (compact) {
    return (
      <div className="border-b border-line py-3 last:border-b-0">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onOpenProfile}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-md bg-transparent p-0 text-left transition-colors hover:text-text"
          >
            <LxAvatar
              name={builder.displayName}
              avatarUrl={builder.avatarUrl}
              size={32}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-[13px] font-semibold text-text">
                {builder.displayName}
              </div>
              <div className="truncate font-mono text-[11px] text-text-faint">
                {metadata}
              </div>
            </div>
          </button>

          {!isSelf && (
            <button
              type="button"
              onClick={onFollow}
              disabled={followPending}
              className={`min-h-11 min-w-29 shrink-0 self-start rounded-md border px-3 py-2 text-center font-mono text-[11.5px] transition-colors ${
                followed
                  ? 'border-text-muted bg-transparent text-text'
                  : 'border-line bg-transparent text-text-muted hover:border-text-muted hover:text-text'
              }`}
            >
              {followPending ? '…' : followed ? 'following' : 'follow'}
            </button>
          )}
        </div>

        {onMessage && (
          <button
            type="button"
            onClick={onMessage}
            disabled={messagePending}
            className="mt-3 flex min-h-11 w-full items-center justify-center rounded-md border border-line px-3 py-2 font-mono text-[11.5px] text-text-muted transition-colors hover:border-text-muted hover:text-text disabled:cursor-default disabled:opacity-60"
          >
            {messagePending ? 'opening…' : 'message'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 border-b border-line py-2 last:border-b-0">
      <button
        type="button"
        onClick={onOpenProfile}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md bg-transparent p-0 text-left transition-colors hover:text-text"
      >
        <LxAvatar
          name={builder.displayName}
          avatarUrl={builder.avatarUrl}
          size={32}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[13px] font-semibold text-text">
            {builder.displayName}
          </div>
          <div className="truncate font-mono text-[11px] text-text-faint">
            {metadata}
          </div>
        </div>
      </button>
      <div className="flex items-center gap-2">
        {onMessage && (
          <button
            type="button"
            onClick={onMessage}
            disabled={messagePending}
            className="min-h-11 min-w-24 rounded-md border border-line px-3 py-2 font-mono text-[11.5px] text-text-muted transition-colors hover:border-text-muted hover:text-text disabled:cursor-default disabled:opacity-60"
          >
            {messagePending ? 'opening…' : 'message'}
          </button>
        )}
        {!isSelf && (
          <button
            type="button"
            onClick={onFollow}
            disabled={followPending}
            className={`min-h-11 min-w-22 rounded-md border px-3 py-2 font-mono text-[11.5px] transition-colors ${
              followed
                ? 'border-text-muted bg-transparent text-text'
                : 'border-line bg-transparent text-text-muted hover:border-text-muted hover:text-text'
            }`}
          >
            {followPending ? '…' : followed ? 'following' : 'follow'}
          </button>
        )}
      </div>
    </div>
  )
}
