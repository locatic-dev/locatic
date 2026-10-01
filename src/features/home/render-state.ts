/**
 * Days of activity Home keeps. Mirrors `HOME_FEED_RETENTION_MS` in
 * `convex/lib/homeFeed.ts` (backfill, `home.list` and cleanup all use it); a
 * test asserts the two agree so the copy always names the real interval.
 */
export const HOME_FEED_WINDOW_DAYS = 30

/**
 * What Home shows. `error` is not derived from data: the route's error
 * boundary renders it when the feed query throws. There is no loading state:
 * the route loader renders the first page on the server and the route's
 * pending component covers navigation.
 */
export type HomeFeedState =
  | { kind: 'noFollows' }
  | { kind: 'quiet30d'; followingCount: number }
  | { kind: 'ready' }
  | { kind: 'error' }

export function getHomeFeedHandoffState<T>({
  paginatedItems,
  ssrItems,
  status,
}: {
  paginatedItems: Array<T>
  ssrItems: Array<T>
  status: string
}) {
  if (status === 'LoadingFirstPage') {
    return {
      items: ssrItems,
      status: 'Idle',
    }
  }

  return {
    items: paginatedItems,
    status,
  }
}

export function getHomeFeedState({
  followingCount,
  itemCount,
}: {
  followingCount: number
  itemCount: number
}): HomeFeedState {
  if (itemCount > 0) {
    return { kind: 'ready' }
  }

  if (followingCount <= 0) {
    return { kind: 'noFollows' }
  }

  return { kind: 'quiet30d', followingCount }
}

export function getQuietFeedTitle(followingCount: number) {
  const people =
    followingCount === 1 ? 'the 1 person' : `the ${followingCount} people`
  return `nothing from ${people} you follow in the last ${HOME_FEED_WINDOW_DAYS} days.`
}
