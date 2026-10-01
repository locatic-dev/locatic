import { useCallback, useEffect, useState } from 'react'
import type { PaginationStatus } from 'convex/react'
import { EXPLORE_PAGINATED_PAGE_SIZE } from './pagination'
import {
  getExploreBrowsePhase,
  requestExploreContinuation,
  settleExploreContinuation,
  shouldAutoAdvanceExploreFeed,
  startExploreContinuation,
  type ExploreBrowsePhase,
} from './feed-state'

type PaginatedFeed = {
  loadMore: (numItems: number) => void
  results: unknown[]
  status: PaginationStatus
}

/**
 * Drives one `usePaginatedQuery` feed. Explore queries read one Convex page
 * per execution and filter it, so a page can arrive empty while more rows
 * exist. When a loaded page shows nothing new, the feed fetches the next page
 * on its own, at most `EXPLORE_AUTO_FETCH_LIMIT` times in a row, then waits
 * for the viewer to keep looking.
 *
 * `visibleItems` are the rows left after client-side dismissals; `resetKey`
 * identifies the result set (query arguments), and a change starts over.
 */
export function useExploreFeedPagination<TItem>({
  enabled,
  paged,
  resetKey,
  visibleItems,
}: {
  enabled: boolean
  paged: PaginatedFeed
  resetKey: string
  visibleItems: TItem[]
}): { loadMore: () => void; phase: ExploreBrowsePhase<TItem> } {
  const key = enabled ? resetKey : null
  const [stored, setStored] = useState(() => startExploreContinuation(key))
  let continuation = stored
  if (stored.key !== key) {
    continuation = startExploreContinuation(key)
    setStored(continuation)
  }

  const { loadMore: loadPage, status } = paged
  const loadedCount = paged.results.length
  const visibleCount = visibleItems.length

  useEffect(() => {
    if (!enabled || status === 'LoadingMore') return

    if (status === 'LoadingFirstPage') {
      // Convex restarts a paginated query after an invalid cursor.
      if (continuation.requestedAt !== 0 || continuation.autoFetches > 0) {
        setStored(startExploreContinuation(continuation.key))
      }
      return
    }

    if (continuation.requestedAt !== null) {
      setStored(settleExploreContinuation(continuation, loadedCount))
      return
    }

    if (shouldAutoAdvanceExploreFeed({ continuation, status, visibleCount })) {
      setStored(
        requestExploreContinuation(continuation, loadedCount, {
          byViewer: false,
        }),
      )
      loadPage(EXPLORE_PAGINATED_PAGE_SIZE)
    }
  }, [continuation, enabled, loadPage, loadedCount, status, visibleCount])

  const loadMore = useCallback(() => {
    if (status !== 'CanLoadMore') return
    setStored(
      requestExploreContinuation(continuation, loadedCount, {
        byViewer: true,
      }),
    )
    loadPage(EXPLORE_PAGINATED_PAGE_SIZE)
  }, [continuation, loadPage, loadedCount, status])

  return {
    loadMore,
    phase: getExploreBrowsePhase({
      continuation,
      items: visibleItems,
      status,
    }),
  }
}
