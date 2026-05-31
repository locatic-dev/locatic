import type { Id } from '../../../../convex/_generated/dataModel'
import { CityPill } from '@/components/ui/city-pill'
import { isExploreUserFollowed } from '@/features/explore/state'
import type { BuilderPreview, ExploreCityChip } from '@/features/explore/types'
import { NearbyBuilderRow } from './nearby-builder-row'

export function ExploreRail({
  compact = false,
  followOverrides,
  followedUserIds,
  hasSelectedCities,
  nearbyBuilders,
  onFollowBuilder,
  onMessageBuilder,
  onOpenBuilderProfile,
  onRemoveCity,
  pendingFollows,
  pendingUserId,
  selectedCityChips,
  viewerId,
}: {
  compact?: boolean
  followOverrides: Record<string, boolean>
  followedUserIds: Set<string>
  hasSelectedCities: boolean
  nearbyBuilders: BuilderPreview[]
  onFollowBuilder: (builder: BuilderPreview) => void
  onMessageBuilder: (builder: BuilderPreview) => (() => void) | undefined
  onOpenBuilderProfile: (builder: BuilderPreview) => void
  onRemoveCity: (cityId: string) => void
  pendingFollows: Set<string>
  pendingUserId: string | null
  selectedCityChips: ExploreCityChip[]
  viewerId?: Id<'users'>
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-card border border-line bg-surface px-4 py-4 shadow-card">
        <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-faint">
          nearby builders
        </div>
        <p className="mb-4 font-sans text-[13px] leading-6 text-text-muted">
          Builders from the active city context. When city filters are selected,
          this rail follows those cities too.
        </p>
        {nearbyBuilders.length > 0 ? (
          <div className="flex flex-col gap-2">
            {nearbyBuilders.map((builder) => (
              <NearbyBuilderRow
                key={builder.userId}
                builder={builder}
                compact={compact}
                onOpenProfile={() => onOpenBuilderProfile(builder)}
                onFollow={() => onFollowBuilder(builder)}
                followed={isExploreUserFollowed({
                  followOverrides,
                  followedUserIds,
                  userId: builder.userId,
                })}
                followPending={pendingFollows.has(String(builder.userId))}
                onMessage={onMessageBuilder(builder)}
                messagePending={pendingUserId === String(builder.userId)}
                isSelf={builder.userId === viewerId}
              />
            ))}
          </div>
        ) : (
          <div className="font-mono text-[11px] leading-5 text-text-faint">
            {hasSelectedCities
              ? 'no nearby builders are available in these cities yet.'
              : 'add a city filter to see nearby builders.'}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-faint">
          city filters
        </div>
        <p className="mb-3 font-mono text-[11px] leading-5 text-text-faint">
          {hasSelectedCities
            ? 'Selected cities are strict for projects. Remove chips to broaden the feed again.'
            : 'Project discovery is following your current scope. Add one or more cities to narrow it down.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {selectedCityChips.length > 0 ? (
            selectedCityChips.map((city) => (
              <CityPill
                key={`aside-${city.id}`}
                city={city.name}
                onRemove={() => onRemoveCity(city.id)}
              />
            ))
          ) : (
            <span className="font-mono text-[11px] text-text-faint">
              no city filters selected
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
