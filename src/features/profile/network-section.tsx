import { LxAvatar } from '@/components/ui/lx-avatar'
import type { ProfileNetworkTab } from '@/features/profile/state'

type SocialPreview = {
  userId: string
  githubUsername: string
  displayName: string
  avatarUrl: string | null
  cityName: string | null
}

export function ProfileNetworkSection({
  activeTab,
  emptyLabel,
  hasMore,
  isPrivate = false,
  items,
  loadingMore,
  onChangeTab,
  onLoadMore,
  onSelectUser,
}: {
  activeTab: ProfileNetworkTab
  emptyLabel: string
  hasMore: boolean
  isPrivate?: boolean
  items: SocialPreview[]
  loadingMore: boolean
  onChangeTab: (tab: ProfileNetworkTab) => void
  onLoadMore: () => void
  onSelectUser: (username: string) => void
}) {
  return (
    <section
      id="profile-network"
      className="rounded-card border border-line bg-surface/40"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-faint">
            network
          </div>
          <div className="mt-1 font-sans text-sm text-text-muted">
            followers and people this builder keeps close.
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-line px-3 py-3">
        {(['followers', 'following'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onChangeTab(tab)}
            className={`min-h-11 rounded-pill px-3.5 font-mono text-[11.5px] transition-colors ${
              activeTab === tab
                ? 'bg-surface-alt text-text'
                : 'text-text-faint hover:text-text'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="px-3 py-2">
        {isPrivate ? (
          <div className="px-2 py-6 font-mono text-[12px] text-text-faint">
            follow graph is private on this profile.
          </div>
        ) : items.length === 0 ? (
          <div className="px-2 py-6 font-mono text-[12px] text-text-faint">
            {emptyLabel}
          </div>
        ) : (
          <>
            {items.map((item) => (
              <button
                key={item.userId}
                type="button"
                onClick={() => onSelectUser(item.githubUsername)}
                className="flex min-h-14 w-full items-center gap-3 rounded-[6px] px-2 py-3 text-left transition-colors hover:bg-surface-alt"
              >
                <LxAvatar
                  name={item.displayName}
                  avatarUrl={item.avatarUrl ?? undefined}
                  size={36}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[12.5px] font-semibold text-text">
                    {item.displayName}
                  </div>
                  <div className="truncate font-mono text-[11px] text-text-faint">
                    @{item.githubUsername}
                    {item.cityName ? ` · ${item.cityName}` : ''}
                  </div>
                </div>
              </button>
            ))}
            {hasMore && (
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore}
                className="mt-3 min-h-11 px-2 font-mono text-[12px] text-text-muted transition-colors hover:text-text disabled:opacity-50"
              >
                {loadingMore ? 'loading…' : 'load more'}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  )
}
