import * as m from 'motion/react-m'
import { PersonRow } from '@/components/ui/person-row'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { indicatorSpring } from '@/lib/motion'
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
  loading = false,
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
  loading?: boolean
  items: SocialPreview[]
  loadingMore: boolean
  onChangeTab: (tab: ProfileNetworkTab) => void
  onLoadMore: () => void
  onSelectUser: (username: string) => void
}) {
  return (
    <section
      id="profile-network"
      aria-labelledby="profile-network-heading"
      className="rounded-card border border-line bg-surface/40"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 id="profile-network-heading" className="m-0 text-title text-text">
            network
          </h2>
          <p className="m-0 mt-0.5 text-meta text-text-faint">
            followers and people this builder follows
          </p>
        </div>
      </div>

      {!isPrivate && (
        <div className="relative flex gap-1 border-b border-line px-3 py-3">
          {(['followers', 'following'] as const).map((tab) => {
            const isActive = activeTab === tab
            return (
              <button
                key={tab}
                type="button"
                onClick={() => onChangeTab(tab)}
                className={`relative min-h-11 rounded-pill px-3.5 font-mono text-label transition-colors ${
                  isActive ? 'text-text' : 'text-text-muted hover:text-text'
                }`}
              >
                {isActive && (
                  <m.span
                    layoutId="profile-network-tab-indicator"
                    transition={indicatorSpring}
                    className="absolute inset-0 rounded-pill bg-surface-alt"
                  />
                )}
                <span className="relative">{tab}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="px-3 py-2">
        {isPrivate ? (
          <EmptyState
            size="compact"
            headingLevel={3}
            title="follow graph is private on this profile."
          />
        ) : loading ? (
          <div
            role="status"
            className="space-y-3 px-2 py-4"
            aria-label="loading network"
          >
            {[0, 1, 2].map((item) => (
              <div key={item} className="flex min-h-14 items-center gap-3">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3 w-28 rounded-pill" />
                  <Skeleton className="h-2.5 w-20 rounded-pill" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState size="compact" headingLevel={3} title={emptyLabel} />
        ) : (
          <>
            {items.map((item) => (
              <PersonRow
                key={item.userId}
                avatarName={item.displayName}
                avatarUrl={item.avatarUrl}
                title={item.displayName}
                meta={
                  <>
                    @{item.githubUsername}
                    {item.cityName ? ` · ${item.cityName}` : ''}
                  </>
                }
                onClick={() => onSelectUser(item.githubUsername)}
                ariaLabel={`Open ${item.displayName}'s profile`}
                identityClassName="px-2 py-2 hover:bg-surface-alt"
              />
            ))}
            {hasMore && (
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore}
                className="mt-3 min-h-11 px-2 font-mono text-label text-text-muted transition-colors hover:text-text disabled:opacity-50"
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
