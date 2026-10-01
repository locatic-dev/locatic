import { Link } from '@tanstack/react-router'
import { useId, type ReactNode } from 'react'
import type { Doc, Id } from '../../../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { CityCombobox } from '@/components/ui/city-combobox'
import { CityPill } from '@/components/ui/city-pill'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { isLive } from '@/lib/builder-activity'
import { relativeTime } from '@/lib/time'
import { useHydratedNow } from '@/lib/use-hydrated-now'
import {
  getExploreScopeLabel,
  type ExploreFilters,
  type ExploreMode,
} from '../state'
import type { BuilderPreview, ExploreCityChip } from '../types'
import type {
  ExploreRailCityStats,
  ExploreRailNearbyCity,
} from '../use-explore-rail'
import { ExploreFilterBar, LanguageQuickPicks } from './explore-filters'
import { SignInLink } from './sign-in-link'

/** The rail's city field; other Explore controls return focus here. */
export const EXPLORE_CITY_INPUT_ID = 'explore-city'

export type ExploreRailPlacement = 'rail' | 'sheet'

/**
 * The rail and the filter sheet render the same controls, so each placement
 * gets its own city field id and the DOM never holds duplicates.
 */
export function getExploreCityInputId(placement: ExploreRailPlacement) {
  return placement === 'rail'
    ? EXPLORE_CITY_INPUT_ID
    : `${EXPLORE_CITY_INPUT_ID}-sheet`
}

export function focusExploreCityInput(placement: ExploreRailPlacement) {
  document.getElementById(getExploreCityInputId(placement))?.focus()
}

export function getExploreCityHeadingId(placement: ExploreRailPlacement) {
  return `explore-city-heading-${placement}`
}

/**
 * Moves focus to the city section's heading, followed by the city's name:
 * after a switch to a nearby city (the clicked row unmounts while that
 * city's list loads) and when the filter sheet gives way to the rail.
 */
export function focusExploreCityHeading(placement: ExploreRailPlacement) {
  document.getElementById(getExploreCityHeadingId(placement))?.focus()
}

export type ExploreRailProps = {
  mode: ExploreMode
  /** Exactly one selected city, else null (global or several cities). */
  railCityId: Id<'cities'> | null
  cityStats: ExploreRailCityStats | null
  nearbyCities: ExploreRailNearbyCity[]
  nearbyBuilders: BuilderPreview[]
  selectedCityChips: ExploreCityChip[]
  availableCities: Array<Doc<'cities'>>
  cityQuery: string
  citySearchPending: boolean
  onCityQueryChange: (query: string) => void
  onAddCity: (city: Doc<'cities'>) => void
  onRemoveCity: (cityId: string) => void
  /**
   * Switches Explore to one city (a nearby city), replacing the selection.
   * The name labels the city until its record loads.
   */
  onSwitchCity: (city: Pick<ExploreRailNearbyCity, 'cityId' | 'name'>) => void
  /** URL filters; the rail shows the ones for the current mode. */
  filters: ExploreFilters
  onFiltersChange: (next: ExploreFilters) => void
  /** Members only: restores dismissed projects or posts. */
  onResetExplore?: () => void
  resetPending?: boolean
  followOverrides: Record<string, boolean>
  followedUserIds: Set<string>
  pendingFollows: Set<string>
  onFollowUser: (
    userId: Id<'users'>,
    userKey: string,
    currentlyFollowed: boolean,
  ) => void
  viewerId?: Id<'users'>
  /** Signed-out visitor: follow becomes a sign-in link. */
  visitor?: { signInRedirect: string | undefined }
}

function RailSection({
  children,
  heading,
  headingLevel,
  focusableHeadingId,
}: {
  children: ReactNode
  heading: string
  headingLevel: 'h2' | 'h3'
  /** Makes the heading a programmatic focus target with this id. */
  focusableHeadingId?: string
}) {
  const generatedId = useId()
  const headingId = focusableHeadingId ?? generatedId
  const Heading = headingLevel
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 border-t border-line pt-5 first:border-t-0 first:pt-0"
    >
      <Heading
        id={headingId}
        tabIndex={focusableHeadingId ? -1 : undefined}
        className="m-0 text-eyebrow text-text-muted"
      >
        {heading}
      </Heading>
      {children}
    </section>
  )
}

function pluralize(count: number, noun: string) {
  return `${count.toLocaleString()} ${count === 1 ? noun : `${noun}s`}`
}

function RailBuilderRow({
  builder,
  followed,
  followPending,
  isSelf,
  onFollow,
  visitor,
}: {
  builder: BuilderPreview
  followed: boolean
  followPending: boolean
  isSelf: boolean
  onFollow: () => void
  visitor?: { signInRedirect: string | undefined }
}) {
  const followLabel = followed ? 'following' : 'follow'
  return (
    <li className="flex min-w-0 items-center justify-between gap-2">
      <Link
        to="/u/$username"
        params={{ username: builder.githubUsername }}
        search={{ tab: 'projects' }}
        preload="intent"
        className="flex min-w-0 items-center gap-2.5 rounded-control no-underline"
      >
        <LxAvatar
          name={builder.displayName}
          avatarUrl={builder.avatarUrl}
          size={28}
          decorative
        />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-sans text-label font-medium text-text">
            {builder.displayName}
          </span>
          <span className="truncate font-mono text-meta text-text-muted">
            @{builder.githubUsername} ·{' '}
            {pluralize(builder.projectsCount, 'project')}
          </span>
        </span>
      </Link>
      {visitor ? (
        <SignInLink
          label={`Sign in to follow ${builder.displayName}`}
          redirect={visitor.signInRedirect}
        >
          follow
        </SignInLink>
      ) : isSelf ? null : (
        <Button
          size="sm"
          variant={followed ? 'ghost' : 'primary'}
          className="pointer-coarse:min-h-11"
          onClick={onFollow}
          disabled={followPending}
          aria-label={`${followLabel} ${builder.displayName}`}
        >
          {followLabel}
        </Button>
      )}
    </li>
  )
}

/**
 * Explore's right rail (at xl) and filter sheet (below xl): the city card,
 * the filters for the current mode, active builders nearby and nearby
 * cities. Presentational; `ExploreView` owns the state and data. In `rail`
 * placement it is a labelled complementary landmark.
 */
export function ExploreRail({
  placement,
  ...props
}: ExploreRailProps & { placement: ExploreRailPlacement }) {
  const headingLevel = placement === 'rail' ? 'h2' : 'h3'
  const {
    mode,
    railCityId,
    cityStats,
    nearbyCities,
    nearbyBuilders,
    selectedCityChips,
    filters,
    onFiltersChange,
    onResetExplore,
    resetPending,
    visitor,
  } = props
  // Clock-relative, so it waits for hydration (the server's clock differs).
  const now = useHydratedNow()
  const railCity = railCityId
    ? selectedCityChips.find((chip) => chip.id === String(railCityId))
    : undefined
  const place = railCity
    ? (railCity.shortName ?? railCity.name)
    : getExploreScopeLabel(selectedCityChips)
  const canResetExplore =
    Boolean(onResetExplore) && (mode === 'projects' || mode === 'posts')
  const showFilters = mode !== 'posts' || canResetExplore
  const showBuilders = mode !== 'builders' && nearbyBuilders.length > 0
  const showNearbyCities = railCityId !== null && nearbyCities.length > 0
  const isFollowed = (userKey: string) =>
    props.followOverrides[userKey] ?? props.followedUserIds.has(userKey)

  const content = (
    <div className="flex flex-col gap-5">
      <RailSection
        heading="city"
        headingLevel={headingLevel}
        focusableHeadingId={getExploreCityHeadingId(placement)}
      >
        <div className="flex flex-col gap-1">
          <p className="m-0 text-title text-text wrap-anywhere">{place}</p>
          {cityStats && (
            <p className="m-0 font-mono text-label text-text-muted">
              {pluralize(cityStats.builderCount, 'builder')} ·{' '}
              {pluralize(cityStats.projectCount, 'project')}
            </p>
          )}
          {cityStats?.lastActivityAt != null && (
            // The line keeps its height until the age can be read.
            <p className="m-0 flex min-h-lh items-center gap-1.5 font-mono text-label text-text-muted">
              {now !== null && isLive(cityStats.lastActivityAt, now) && (
                <span
                  role="img"
                  aria-label="active in the last 24h"
                  className="size-1.5 shrink-0 rounded-full bg-live"
                />
              )}
              {now !== null &&
                `last active ${relativeTime(cityStats.lastActivityAt)}`}
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {selectedCityChips.map((city) => (
            <CityPill
              key={city.id}
              city={city.name}
              truncate={false}
              className="max-w-full shrink"
              onRemove={() => {
                props.onRemoveCity(city.id)
                // The removed chip's button unmounts; continue at this
                // placement's city field rather than losing focus.
                focusExploreCityInput(placement)
              }}
            />
          ))}
        </div>
        <CityCombobox
          id={getExploreCityInputId(placement)}
          label="Add a city filter"
          query={props.cityQuery}
          onQueryChange={props.onCityQueryChange}
          cities={props.availableCities}
          searching={props.citySearchPending}
          onSelectCity={props.onAddCity}
          placeholder="+ add city"
          inputClassName="h-9 pointer-coarse:h-11"
        />
      </RailSection>

      {showFilters && (
        <RailSection heading="filters" headingLevel={headingLevel}>
          {mode === 'projects' && (
            <LanguageQuickPicks
              filters={filters}
              onFiltersChange={onFiltersChange}
            />
          )}
          {mode !== 'posts' && (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <ExploreFilterBar
                filters={filters}
                mode={mode}
                onFiltersChange={onFiltersChange}
              />
            </div>
          )}
          {canResetExplore && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                className="-ml-3 pointer-coarse:min-h-11"
                onClick={onResetExplore}
                disabled={resetPending}
              >
                {resetPending ? 'resetting…' : 'reset dismissed'}
              </Button>
            </div>
          )}
        </RailSection>
      )}

      {showBuilders && (
        <RailSection
          heading={
            selectedCityChips.length > 0 ? 'active nearby' : 'active builders'
          }
          headingLevel={headingLevel}
        >
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {nearbyBuilders.map((builder) => {
              const userKey = String(builder.userId)
              const followed = isFollowed(userKey)
              return (
                <RailBuilderRow
                  key={userKey}
                  builder={builder}
                  followed={followed}
                  followPending={props.pendingFollows.has(userKey)}
                  isSelf={
                    props.viewerId !== undefined &&
                    builder.userId === props.viewerId
                  }
                  onFollow={() =>
                    props.onFollowUser(builder.userId, userKey, followed)
                  }
                  visitor={visitor}
                />
              )
            })}
          </ul>
        </RailSection>
      )}

      {showNearbyCities && (
        <RailSection heading="nearby cities" headingLevel={headingLevel}>
          <ul className="m-0 flex list-none flex-col p-0">
            {nearbyCities.map((city) => (
              <li key={String(city.cityId)} className="-mx-2">
                <button
                  type="button"
                  onClick={() => {
                    props.onSwitchCity(city)
                    // This row unmounts while the new city's list loads.
                    focusExploreCityHeading(placement)
                  }}
                  className="flex w-full items-baseline justify-between gap-3 rounded-control px-2 py-1.5 text-left transition-colors hover:bg-state-hover pointer-coarse:min-h-11 pointer-coarse:items-center"
                >
                  <span className="min-w-0 truncate font-sans text-label font-medium text-text">
                    {city.name}
                  </span>
                  <span className="shrink-0 font-mono text-meta text-text-muted">
                    {pluralize(city.builderCount, 'builder')} ·{' '}
                    {city.distanceKm.toLocaleString()} km
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </RailSection>
      )}
    </div>
  )

  return placement === 'rail' ? (
    <aside aria-label="explore filters" className="min-w-0">
      {content}
    </aside>
  ) : (
    content
  )
}
