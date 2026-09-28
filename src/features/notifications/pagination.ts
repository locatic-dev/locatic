/**
 * Hands the SSR first page over to the live `usePaginatedQuery` list.
 *
 * The route loader renders the first page on the server so the list paints
 * with content. Until the live subscription delivers its first page, the SSR
 * rows are shown; after that, the live results are the only source. The live
 * list keeps every loaded page and updates them in place, so a new
 * notification arriving at the top never drops the pages already loaded.
 */
export function getNotificationsListState<T>({
  liveItems,
  ssrItems,
  status,
}: {
  liveItems: Array<T>
  ssrItems: Array<T>
  status: 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted'
}) {
  if (status === 'LoadingFirstPage') {
    return { items: ssrItems, canLoadMore: false, loadingMore: false }
  }

  return {
    items: liveItems,
    // Load more stays available whenever Convex says more pages exist, even
    // when the loaded page happens to be empty.
    canLoadMore: status === 'CanLoadMore',
    loadingMore: status === 'LoadingMore',
  }
}
