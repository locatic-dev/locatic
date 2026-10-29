import type { PaginationStatus } from 'convex/react'
import type { ExploreMode } from './state'
import type {
  BuilderPreview,
  ExplorePostPreview,
  ExploreProjectPreview,
} from './types'

/**
 * Automatic fetches allowed after a loaded page adds no visible rows, before
 * the feed stops and asks the viewer to keep looking. With 20-row pages the
 * automatic reads of one interaction stay within 60 index rows.
 */
export const EXPLORE_AUTO_FETCH_LIMIT = 3

type NonEmptyArray<T> = [T, ...T[]]

export function isNonEmptyArray<T>(items: T[]): items is NonEmptyArray<T> {
  return items.length > 0
}

/** The "load more" affordance of a feed that has rows to show. */
export type ExploreFeedMore = 'none' | 'available' | 'loading'

type ReadyPhase<TItem> = {
  status: 'ready'
  items: NonEmptyArray<TItem>
  more: ExploreFeedMore
}

/**
 * Paginated browse feeds. Only `exhausted` (the server said `isDone` and
 * nothing is visible) renders the empty state; a filtered-empty page with a
 * continuation is `emptyPageWithMore` while the feed fetches on its own and
 * `needsContinuation` once the empty-page budget is spent.
 */
export type ExploreBrowsePhase<TItem> =
  | { status: 'loading' }
  | ReadyPhase<TItem>
  | { status: 'emptyPageWithMore'; items: TItem[] }
  | { status: 'needsContinuation'; items: TItem[] }
  | { status: 'exhausted' }

/** Text searches return one bounded result set, so they never continue. */
export type ExploreSearchPhase<TItem> =
  | { status: 'loading' }
  | ReadyPhase<TItem>
  | { status: 'exhausted' }
  | { status: 'error' }

type ExploreFeedItemByMode = {
  builders: BuilderPreview
  projects: ExploreProjectPreview
  posts: ExplorePostPreview
}

type ExploreFeedStateFor<TMode extends ExploreMode> =
  | ({
      mode: TMode
      source: 'browse'
      scope: 'global' | 'cities'
    } & ExploreBrowsePhase<ExploreFeedItemByMode[TMode]>)
  | ({
      mode: TMode
      source: 'search'
      query: string
    } & ExploreSearchPhase<ExploreFeedItemByMode[TMode]>)

export type ExploreFeedState = {
  [TMode in ExploreMode]: ExploreFeedStateFor<TMode>
}[ExploreMode]

export type ExploreFeedStatus = ExploreFeedState['status']

/**
 * Client bookkeeping for bounded automatic advancement. `requestedAt` is the
 * number of loaded rows when a page was requested (null when nothing is in
 * flight); `lastPageEmpty` says the last settled page added no rows;
 * `autoFetches` counts automatic fetches since the viewer last asked for more
 * or a page added rows.
 */
export type ExploreContinuation = {
  key: string | null
  autoFetches: number
  lastPageEmpty: boolean
  requestedAt: number | null
}

/** A fresh result set: the first page counts as requested with 0 rows. */
export function startExploreContinuation(
  key: string | null,
): ExploreContinuation {
  return { key, autoFetches: 0, lastPageEmpty: false, requestedAt: 0 }
}

export function requestExploreContinuation(
  continuation: ExploreContinuation,
  loadedCount: number,
  { byViewer }: { byViewer: boolean },
): ExploreContinuation {
  return {
    ...continuation,
    autoFetches: byViewer ? 0 : continuation.autoFetches + 1,
    requestedAt: loadedCount,
  }
}

export function settleExploreContinuation(
  continuation: ExploreContinuation,
  loadedCount: number,
): ExploreContinuation {
  if (continuation.requestedAt === null) return continuation

  const lastPageEmpty = loadedCount <= continuation.requestedAt
  return {
    ...continuation,
    autoFetches: lastPageEmpty ? continuation.autoFetches : 0,
    lastPageEmpty,
    requestedAt: null,
  }
}

/** Nothing new to show: the last page was empty or every row is hidden. */
function isWaitingForRows(
  continuation: ExploreContinuation,
  visibleCount: number,
) {
  return continuation.lastPageEmpty || visibleCount === 0
}

export function shouldAutoAdvanceExploreFeed({
  continuation,
  status,
  visibleCount,
}: {
  continuation: ExploreContinuation
  status: PaginationStatus
  visibleCount: number
}) {
  return (
    status === 'CanLoadMore' &&
    continuation.requestedAt === null &&
    continuation.autoFetches < EXPLORE_AUTO_FETCH_LIMIT &&
    isWaitingForRows(continuation, visibleCount)
  )
}

export function getExploreBrowsePhase<TItem>({
  continuation,
  items,
  status,
}: {
  continuation: ExploreContinuation
  items: TItem[]
  status: PaginationStatus
}): ExploreBrowsePhase<TItem> {
  switch (status) {
    case 'LoadingFirstPage':
      return { status: 'loading' }
    case 'Exhausted':
      return isNonEmptyArray(items)
        ? { status: 'ready', items, more: 'none' }
        : { status: 'exhausted' }
    case 'LoadingMore':
      return isNonEmptyArray(items) && continuation.autoFetches === 0
        ? { status: 'ready', items, more: 'loading' }
        : { status: 'emptyPageWithMore', items }
    case 'CanLoadMore':
    default:
      if (!isWaitingForRows(continuation, items.length)) {
        return isNonEmptyArray(items)
          ? { status: 'ready', items, more: 'available' }
          : { status: 'emptyPageWithMore', items }
      }
      return continuation.autoFetches >= EXPLORE_AUTO_FETCH_LIMIT
        ? { status: 'needsContinuation', items }
        : { status: 'emptyPageWithMore', items }
  }
}

export function getExploreSearchPhase<TItem>({
  hasMore = false,
  isError,
  isLoading,
  isLoadingMore = false,
  items,
}: {
  hasMore?: boolean
  isError: boolean
  isLoading: boolean
  isLoadingMore?: boolean
  items: TItem[]
}): ExploreSearchPhase<TItem> {
  if (isLoading) return { status: 'loading' }
  if (isNonEmptyArray(items)) {
    return {
      status: 'ready',
      items,
      more: !hasMore ? 'none' : isLoadingMore ? 'loading' : 'available',
    }
  }
  return isError ? { status: 'error' } : { status: 'exhausted' }
}

const SINGULAR_RESULT: Record<ExploreMode, string> = {
  builders: 'builder',
  posts: 'post',
  projects: 'project',
}

/**
 * What a polite status line says when the results change ("12 projects",
 * "no projects match"), so a screen reader hears the outcome of a filter or
 * city change. Empty while loading or still looking for rows; the skeleton
 * has its own status.
 */
export function describeExploreResults(
  state: ExploreFeedState,
  { filtered }: { filtered: boolean },
): string {
  switch (state.status) {
    case 'loading':
      return ''
    case 'error':
      return `couldn't load ${state.mode}`
    case 'exhausted':
      if (filtered) return `no ${state.mode} match these filters`
      return state.source === 'search'
        ? `no ${state.mode} match “${state.query}”`
        : `no ${state.mode} match`
    default: {
      const count = state.items.length
      if (count === 0) return ''
      return `${count} ${count === 1 ? SINGULAR_RESULT[state.mode] : state.mode}`
    }
  }
}
