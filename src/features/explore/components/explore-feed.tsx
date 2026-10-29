import { useRef, useState, type ReactNode } from 'react'
import * as m from 'motion/react-m'
import type { Id } from '../../../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ProjectCard } from '@/components/ui/project-card'
import { CardSheet, cardSheetClass } from '@/components/ui/card-sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useEmptyStateActionMetric } from '@/integrations/convex/metrics'
import {
  describeExploreResults,
  type ExploreFeedState,
} from '@/features/explore/feed-state'
import {
  isExploreUserFollowed,
  type ExploreMode,
} from '@/features/explore/state'
import { EXPLORE_PAGINATED_PAGE_SIZE } from '@/features/explore/pagination'
import { Compass } from '@/lib/icons'
import { fadeUp, listStagger } from '@/lib/motion'
import type { BuilderPreview } from '@/features/explore/types'
import { toProjectCardData } from '@/features/project-card-preview'
import { NearbyBuilderRow } from './nearby-builder-row'
import { ExplorePostCard } from './explore-post-card'
import { SignInLink } from './sign-in-link'
import { ProjectReactionBar } from '@/features/projects/reactions/project-reaction-bar'
import { useProjectSaveToggle } from '@/features/projects/saves'
import { useExploreSavedProjectIds } from '../use-explore-saves'

/**
 * The one explicitly selected city of an empty browse feed.
 * `builderCount` comes from the city counters (null while loading);
 * `localBuilders` is a short, bounded list of the city's builders.
 */
export type ExploreEmptyCity = {
  cityName: string
  builderCount: number | null
  onBrowseEverywhere: () => void
  onChooseAnotherCity: () => void
  localBuilders: BuilderPreview[]
}

/** Signed-out visitor: personal actions become sign-in links. */
export type ExploreVisitor = { signInRedirect: string | undefined }

/**
 * The URL filters narrowing the current feed: a plain description
 * ("primary language rust, topic #webgpu") and the action that clears them.
 */
export type ExploreActiveFilters = {
  description: string
  onClear: () => void
}

/**
 * A feed exhausted under filters: the filters, not the city or Explore as a
 * whole, are why nothing shows, so the way out is clearing them.
 */
function FilteredEmptyState({
  filters,
  mode,
}: {
  filters: ExploreActiveFilters
  mode: ExploreMode
}) {
  const counted = useEmptyStateActionMetric()

  return (
    <div className="py-6">
      <EmptyState
        icon={<Compass size={28} strokeWidth={1.2} />}
        title={`no ${mode} match these filters.`}
        description={`Nothing here with ${filters.description}.`}
        action={{ label: 'clear filters', onClick: counted(filters.onClear) }}
      />
    </div>
  )
}

function formatBuilderCount(count: number) {
  return `${count.toLocaleString()} ${count === 1 ? 'builder' : 'builders'} here`
}

/**
 * Empty browse feed for one explicitly selected city: names the city, says
 * how many builders it has, and offers two actions. Neither changes the
 * scope until clicked.
 */
function EmptyCityState({
  emptyCity,
  mode,
  renderBuilder,
}: {
  emptyCity: ExploreEmptyCity
  mode: ExploreMode
  renderBuilder: (builder: BuilderPreview) => ReactNode
}) {
  // The builders feed is itself the list of local builders.
  const localBuilders = mode === 'builders' ? [] : emptyCity.localBuilders
  const counted = useEmptyStateActionMetric()

  return (
    <div className="py-6">
      <EmptyState
        icon={<Compass size={28} strokeWidth={1.2} />}
        title={`no ${mode} in ${emptyCity.cityName} yet.`}
        description={
          emptyCity.builderCount === null
            ? undefined
            : formatBuilderCount(emptyCity.builderCount)
        }
        action={{
          label: 'browse everywhere',
          onClick: counted(emptyCity.onBrowseEverywhere),
        }}
        secondaryAction={{
          label: 'choose another city',
          onClick: counted(emptyCity.onChooseAnotherCity),
        }}
      />
      {localBuilders.length > 0 ? (
        <section
          aria-labelledby="explore-empty-city-builders"
          className="mt-6 border-t border-line pt-6"
        >
          <h2
            id="explore-empty-city-builders"
            className="m-0 mb-3 text-title text-text"
          >
            builders in {emptyCity.cityName}
          </h2>
          <CardSheet>
            {localBuilders.map((builder) => (
              <div key={String(builder.userId)}>{renderBuilder(builder)}</div>
            ))}
          </CardSheet>
        </section>
      ) : null}
    </div>
  )
}

function getInitialPageKeys<T>(items: T[], getKey: (item: T) => string) {
  return new Set(items.slice(0, EXPLORE_PAGINATED_PAGE_SIZE).map(getKey))
}

function InitialPageMotionList<T>({
  children,
  getKey,
  items,
  motionClassName,
  className,
}: {
  children: (item: T) => ReactNode
  getKey: (item: T) => string
  items: T[]
  motionClassName?: string
  className: string
}) {
  const [initialKeys] = useState(() => getInitialPageKeys(items, getKey))

  return (
    <m.div
      className={className}
      variants={listStagger}
      initial="hidden"
      animate="visible"
    >
      {items.map((item) => {
        const key = getKey(item)
        const row = children(item)

        return initialKeys.has(key) ? (
          <m.div key={key} variants={fadeUp} className={motionClassName}>
            {row}
          </m.div>
        ) : (
          <div key={key} className={motionClassName}>
            {row}
          </div>
        )
      })}
    </m.div>
  )
}

/** Mirrors ExplorePostCard: author identity, body lines, reaction row. */
function PostRowSkeleton() {
  return (
    <div className="bg-surface">
      <div className="px-5 pt-4 pb-2">
        <div className="mb-3 flex items-center gap-2.5">
          <Skeleton className="size-8.5 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="flex h-5 items-center">
              <Skeleton className="h-3 w-28" />
            </div>
            <div className="flex h-4 items-center">
              <Skeleton className="h-2.5 w-36" />
            </div>
          </div>
        </div>
        <div className="flex h-6 items-center">
          <Skeleton className="h-3.5 w-full" />
        </div>
        <div className="flex h-6 items-center">
          <Skeleton className="h-3.5 w-4/5" />
        </div>
      </div>
      <div className="flex items-center gap-1.5 px-5 pb-2">
        <Skeleton className="h-7 w-12 rounded-full pointer-coarse:h-11" />
        <Skeleton className="size-7 rounded-full pointer-coarse:size-11" />
      </div>
    </div>
  )
}

function BuilderRowSkeleton() {
  return (
    <div className="flex items-center gap-3 bg-surface px-5 py-4">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="mt-2 h-3 w-40" />
      </div>
      <Skeleton className="h-11 w-22 shrink-0 rounded-md" />
    </div>
  )
}

function FeedMoreButton({
  label,
  onClick,
  pending,
}: {
  label: string
  onClick: () => void
  pending: boolean
}) {
  return (
    <div className="mt-4 flex justify-center">
      <Button
        variant="secondary"
        size="touch"
        onClick={onClick}
        disabled={pending}
        // Also set while a server-rendered first page waits for the live
        // feed (first-page.ts), so "load more" never looks ready too early.
        aria-busy={pending || undefined}
      >
        {pending ? 'loading…' : label}
      </Button>
    </div>
  )
}

/**
 * Footer for a feed with continuation: a filtered-empty page never reads as
 * "no results" while the server has more; the feed either fetches on its own
 * (`emptyPageWithMore`) or offers "keep looking" once its budget is spent.
 */
function FeedFooter({
  mode,
  onLoadMore,
  state,
}: {
  mode: ExploreMode
  onLoadMore: () => void
  state: Extract<
    ExploreFeedState,
    { status: 'ready' | 'emptyPageWithMore' | 'needsContinuation' }
  >
}) {
  switch (state.status) {
    case 'ready':
      return state.more === 'none' ? null : (
        <FeedMoreButton
          label={`load more ${mode}`}
          onClick={onLoadMore}
          pending={state.more === 'loading'}
        />
      )
    case 'emptyPageWithMore':
      return (
        <FeedMoreButton
          label={`load more ${mode}`}
          onClick={onLoadMore}
          pending
        />
      )
    case 'needsContinuation':
    default:
      return (
        <FeedMoreButton
          label="keep looking"
          onClick={onLoadMore}
          pending={false}
        />
      )
  }
}

/**
 * Mirrors the row ProjectCard with the author in the header: identity line,
 * repo title, two description lines, the meta line, then the footer with
 * reactions and follow/save actions. Each text line is one line box of the
 * card's type role (`h-lh`), and the identity line and footer grow to 44px on
 * coarse pointers as the card's controls do. On a narrow card place and age
 * wrap under the name, as in the card.
 */
function ProjectCardSkeletonRow() {
  return (
    <div
      data-testid="project-card-skeleton"
      className="@container flex flex-col gap-3 bg-surface px-5 py-4"
    >
      <div className="flex flex-col gap-1.5">
        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <div className="flex items-center gap-2.5 pointer-coarse:min-h-11">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="flex h-lh items-center text-eyebrow @max-xl:-mt-2 @max-xl:basis-full @max-xl:pl-10.5">
            <Skeleton className="h-2.5 w-20" />
          </div>
        </div>
        <div className="flex h-lh items-center text-title">
          <Skeleton className="h-4 w-3/5" />
        </div>
        <div className="flex h-lh items-center text-body">
          <Skeleton className="h-3 w-full" />
        </div>
        <div className="flex h-lh items-center text-body">
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
      <div className="flex h-lh items-center font-mono text-label">
        <Skeleton className="h-2.5 w-48" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-7 w-24 rounded-full pointer-coarse:h-11" />
        <Skeleton className="h-7 w-28 rounded-control pointer-coarse:h-11" />
      </div>
    </div>
  )
}

/**
 * Built from the ready state's containers so rows land where the skeleton
 * was: the same outer spacing, a reserved list-heading line, and the same
 * list wrapper (separate cards with a gap for projects, one sheet otherwise).
 */
function FeedSkeleton({ state }: { state: ExploreFeedState }) {
  const label = `${state.source === 'search' ? 'searching' : 'loading'} ${state.mode}…`
  const rows = [0, 1, 2]

  return (
    <div role="status" aria-label={label} className="mb-8">
      <div aria-hidden="true" className="mb-3 flex h-4 items-center">
        <Skeleton className="h-2.5 w-16" />
      </div>
      {state.mode === 'projects' ? (
        <div className={cardSheetClass}>
          {rows.map((index) => (
            <ProjectCardSkeletonRow key={index} />
          ))}
        </div>
      ) : (
        <CardSheet>
          {rows.map((index) =>
            state.mode === 'builders' ? (
              <BuilderRowSkeleton key={index} />
            ) : (
              <PostRowSkeleton key={index} />
            ),
          )}
        </CardSheet>
      )}
    </div>
  )
}

function FeedEmptyState({
  onClearCityFilters,
  onResetExplore,
  resetPending,
  state,
}: {
  onClearCityFilters?: () => void
  onResetExplore?: () => void
  resetPending?: boolean
  state: Extract<ExploreFeedState, { status: 'exhausted' }>
}) {
  const counted = useEmptyStateActionMetric()
  const resetAction = onResetExplore
    ? {
        label: resetPending ? 'resetting…' : 'reset dismissed',
        onClick: counted(onResetExplore),
      }
    : undefined
  const clearCitiesAction = onClearCityFilters
    ? { label: 'clear city filters', onClick: counted(onClearCityFilters) }
    : undefined
  const icon = <Compass size={28} strokeWidth={1.2} />

  const content = (() => {
    if (state.source === 'search') {
      switch (state.mode) {
        case 'builders':
          return {
            title: `no builders found for “${state.query}”.`,
            description: 'Try a different name or username.',
          }
        case 'posts':
          return {
            title: `no posts found for “${state.query}”.`,
            description: 'Try a different phrase or topic.',
          }
        case 'projects':
        default:
          return {
            title: 'no projects found.',
            description: 'Try a different search term or check the spelling.',
          }
      }
    }

    const isGlobal = state.scope === 'global'
    switch (state.mode) {
      case 'builders':
        return {
          title: 'no builders found for this city context.',
          description:
            'Try another city or check back once more builders join nearby.',
        }
      case 'posts':
        return isGlobal
          ? {
              title: 'no posts to explore right now.',
              description:
                'Try searching for a phrase or check back after more project posts are published.',
              action: resetAction,
            }
          : {
              title: 'no posts found for this city context.',
              description:
                'Try another city, remove one of your selected filters, or search post text directly.',
              action: resetAction,
              secondaryAction: clearCitiesAction,
            }
      case 'projects':
      default:
        return isGlobal
          ? {
              title: 'nothing to explore right now.',
              description:
                'Try searching for builders, add city filters, or check back after more projects are imported.',
              action: resetAction,
            }
          : {
              title: 'no projects match these cities yet.',
              description:
                'Try another city, remove one of your selected filters, or check back after more projects are imported.',
              action: resetAction,
              secondaryAction: clearCitiesAction,
            }
    }
  })()

  return (
    <div className="py-6">
      <EmptyState icon={icon} {...content} />
    </div>
  )
}

function ExploreFeedBody({
  activeFilters,
  emptyCity,
  entranceKey,
  followOverrides,
  followedUserIds,
  likedProjectIds,
  onClearCityFilters,
  onDismissPost,
  onDismissProject,
  onFollowUser,
  onLoadMore,
  onMessageUser,
  onResetExplore,
  orderingCopy,
  pendingFollows,
  pendingUserId,
  resetPending,
  state,
  viewerId,
  visitor,
}: {
  /** Filters narrowing this feed; absent when none apply to the mode. */
  activeFilters?: ExploreActiveFilters
  /** Set when exactly one city is explicitly selected (custom scope). */
  emptyCity?: ExploreEmptyCity
  entranceKey: string
  followOverrides: Record<string, boolean>
  followedUserIds: Set<string>
  likedProjectIds: Set<string>
  onClearCityFilters?: () => void
  onDismissPost: (postId: Id<'posts'>, postKey: string) => void
  onDismissProject: (projectId: Id<'projects'>, projectKey: string) => void
  onFollowUser: (
    userId: Id<'users'>,
    userKey: string,
    currentlyFollowed: boolean,
  ) => void
  /** Loads the next page; also the "keep looking" continuation action. */
  onLoadMore: () => void
  onMessageUser: (userId: Id<'users'>) => void
  onResetExplore?: () => void
  /** How the browse feed is ordered, shown beside the list heading. */
  orderingCopy?: string | null
  pendingFollows: Set<string>
  pendingUserId: string | null
  resetPending?: boolean
  state: ExploreFeedState
  viewerId?: Id<'users'>
  visitor?: ExploreVisitor
}) {
  // Saved state for the loaded project cards, members only.
  const saveToggle = useProjectSaveToggle()
  const savedProjectIds = useExploreSavedProjectIds(
    state.mode === 'projects' && 'items' in state
      ? state.items.map((item) => item.projectId)
      : [],
    !visitor,
  )

  const getFollowedState = (userId: Id<'users'>) =>
    isExploreUserFollowed({
      followOverrides,
      followedUserIds,
      userId,
    })

  const renderBuilderRow = (builder: BuilderPreview) => (
    <NearbyBuilderRow
      builder={builder}
      onFollow={() =>
        onFollowUser(
          builder.userId,
          String(builder.userId),
          getFollowedState(builder.userId),
        )
      }
      followed={getFollowedState(builder.userId)}
      followPending={pendingFollows.has(String(builder.userId))}
      onMessage={
        viewerId && builder.userId !== viewerId
          ? () => onMessageUser(builder.userId)
          : undefined
      }
      messagePending={pendingUserId === String(builder.userId)}
      isSelf={builder.userId === viewerId}
      visitor={visitor}
    />
  )

  if (
    state.status === 'loading' ||
    (state.status === 'emptyPageWithMore' && state.items.length === 0)
  ) {
    return <FeedSkeleton state={state} />
  }

  if (state.status === 'exhausted') {
    if (activeFilters) {
      return <FilteredEmptyState filters={activeFilters} mode={state.mode} />
    }

    if (emptyCity && state.source === 'browse') {
      return (
        <EmptyCityState
          emptyCity={emptyCity}
          mode={state.mode}
          renderBuilder={renderBuilderRow}
        />
      )
    }

    return (
      <FeedEmptyState
        state={state}
        onClearCityFilters={onClearCityFilters}
        onResetExplore={onResetExplore}
        resetPending={resetPending}
      />
    )
  }

  if (state.status === 'error') {
    return (
      <div className="py-6">
        <EmptyState
          icon={<Compass size={28} strokeWidth={1.2} />}
          title={`couldn't load ${state.mode}.`}
          description="Try again in a moment."
        />
      </div>
    )
  }

  const footer = (
    <FeedFooter mode={state.mode} onLoadMore={onLoadMore} state={state} />
  )

  if (state.items.length === 0) {
    // Continuation remains, so this is never "no results".
    return (
      <div className="py-6 text-center">
        <p className="font-mono text-label text-text-muted">
          {activeFilters
            ? `no ${state.mode} with ${activeFilters.description} in the latest results yet.`
            : `no ${state.mode} in the latest results yet.`}
        </p>
        {footer}
      </div>
    )
  }

  const heading = (
    <div className="mb-3 font-mono text-meta text-text-muted">
      {state.source === 'search' ? `matching ${state.mode}` : state.mode}
      {state.source === 'browse' && orderingCopy ? (
        <span className="text-text-muted"> · {orderingCopy}</span>
      ) : null}
    </div>
  )

  if (state.mode === 'builders') {
    return (
      <div className="mb-8">
        {heading}
        <InitialPageMotionList
          key={`builders:${entranceKey}`}
          className={cardSheetClass}
          items={state.items}
          getKey={(builder) => String(builder.userId)}
        >
          {renderBuilderRow}
        </InitialPageMotionList>
        {footer}
      </div>
    )
  }

  if (state.mode === 'posts') {
    return (
      <div className="mb-8">
        {heading}
        <InitialPageMotionList
          key={`posts:${entranceKey}`}
          className={cardSheetClass}
          items={state.items}
          getKey={(post) => String(post._id)}
        >
          {(post) => (
            <ExplorePostCard
              post={post}
              onDismiss={
                visitor
                  ? undefined
                  : () => onDismissPost(post._id, String(post._id))
              }
              visitor={visitor}
            />
          )}
        </InitialPageMotionList>
        {footer}
      </div>
    )
  }

  return (
    <div className="mb-8">
      {heading}
      <InitialPageMotionList
        key={`projects:${entranceKey}`}
        className={cardSheetClass}
        items={state.items}
        getKey={(item) => String(item.projectId)}
      >
        {(item) => {
          const projectId = item.projectId
          const projectKey = String(item.projectId)
          const ownerId = item.ownerUserId
          const ownerKey = String(ownerId)
          const liked = likedProjectIds.has(projectKey)
          const saved = savedProjectIds.has(projectKey)
          const followed = getFollowedState(ownerId)
          const cardData = { ...toProjectCardData(item), followed }
          const projectLink = { owner: item.owner, repo: item.repo }
          const authorLink = { username: item.authorHandle }
          // Search results do not carry `isViewerProject`, so the owner id
          // decides too: nobody follows, hides or saves their own project.
          const isOwn =
            item.isViewerProject === true ||
            (viewerId !== undefined && ownerId === viewerId)

          const card = visitor ? (
            <ProjectCard
              variant="row"
              project={cardData}
              authorPlacement="header"
              reactionSlot={
                <ProjectReactionBar
                  disabled
                  projectId={projectId}
                  reactionCounts={item.reactionCounts}
                  viewerReactionTypes={[]}
                />
              }
              actionSlot={
                <SignInLink
                  appearance="text"
                  label={`Sign in to react, follow or save ${item.fullName}`}
                  redirect={visitor.signInRedirect}
                >
                  sign in to react, follow or save
                </SignInLink>
              }
              className="focus-visible:ring-inset"
              authorLink={authorLink}
              projectLink={projectLink}
            />
          ) : (
            <ProjectCard
              variant="row"
              project={cardData}
              authorPlacement="header"
              reactionSlot={
                <ProjectReactionBar
                  projectId={projectId}
                  reactionCounts={item.reactionCounts}
                  viewerReactionTypes={item.viewerReactionTypes}
                  liked={liked}
                />
              }
              className="focus-visible:ring-inset"
              onDismiss={
                isOwn
                  ? undefined
                  : () => onDismissProject(projectId, projectKey)
              }
              authorLink={authorLink}
              onFollow={
                isOwn
                  ? undefined
                  : () => onFollowUser(ownerId, ownerKey, followed)
              }
              projectLink={projectLink}
              followPending={pendingFollows.has(ownerKey)}
              saved={saved}
              savePending={saveToggle.isPending(projectId)}
              onToggleSave={
                isOwn
                  ? undefined
                  : () =>
                      void saveToggle.toggle({
                        projectId,
                        projectName: item.fullName,
                        saved,
                      })
              }
            />
          )

          // The viewer's own projects, after everyone else's in a selected
          // city: labelled as theirs, never framed as a recommendation.
          return isOwn ? (
            <div className="flex flex-col">
              <p className="m-0 bg-surface px-5 pt-3 text-eyebrow text-text-muted">
                yours
              </p>
              {card}
            </div>
          ) : (
            card
          )
        }}
      </InitialPageMotionList>
      {footer}
    </div>
  )
}

type ExploreFeedProps = Parameters<typeof ExploreFeedBody>[0]

/**
 * The Explore results, in a labelled region that can take focus, with a
 * polite status line that says how many results there are ("12 projects",
 * "no projects match"). Empty-state actions (clear filters, browse
 * everywhere, clear city filters, reset dismissed) unmount the button that
 * was pressed, so they move focus to the results rather than losing it.
 */
export function ExploreFeed(props: ExploreFeedProps) {
  const resultsRef = useRef<HTMLElement>(null)
  const { activeFilters, emptyCity, onClearCityFilters, onResetExplore } = props
  const thenFocusResults = (action: () => void) => () => {
    action()
    resultsRef.current?.focus()
  }

  return (
    <section
      ref={resultsRef}
      tabIndex={-1}
      aria-label={`${props.state.mode} results`}
    >
      <p role="status" className="sr-only">
        {describeExploreResults(props.state, {
          filtered: Boolean(activeFilters),
        })}
      </p>
      <ExploreFeedBody
        {...props}
        activeFilters={
          activeFilters && {
            ...activeFilters,
            onClear: thenFocusResults(activeFilters.onClear),
          }
        }
        emptyCity={
          emptyCity && {
            ...emptyCity,
            onBrowseEverywhere: thenFocusResults(emptyCity.onBrowseEverywhere),
          }
        }
        onClearCityFilters={
          onClearCityFilters && thenFocusResults(onClearCityFilters)
        }
        onResetExplore={onResetExplore && thenFocusResults(onResetExplore)}
      />
    </section>
  )
}
