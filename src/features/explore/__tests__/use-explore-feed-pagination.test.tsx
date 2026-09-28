// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import type { PaginationStatus } from 'convex/react'
import { describe, expect, it, vi } from 'vitest'
import { EXPLORE_AUTO_FETCH_LIMIT } from '../feed-state'
import { EXPLORE_PAGINATED_PAGE_SIZE } from '../pagination'
import { useExploreFeedPagination } from '../use-explore-feed-pagination'

type Snapshot = { results: string[]; status: PaginationStatus }
type Options = { enabled?: boolean; hidden?: Set<string>; resetKey?: string }

/**
 * Stand-in for `usePaginatedQuery`: like Convex, `loadMore` switches a feed
 * that can load more to `LoadingMore` in the same update.
 */
function createFakeFeed(initial: Snapshot) {
  let snapshot = initial
  const listeners = new Set<() => void>()
  const set = (next: Snapshot) => {
    snapshot = next
    for (const listener of listeners) listener()
  }
  return {
    get: () => snapshot,
    loadMore: vi.fn<(numItems: number) => void>(() => {
      if (snapshot.status === 'CanLoadMore') {
        set({ ...snapshot, status: 'LoadingMore' })
      }
    }),
    set: (next: Snapshot) => act(() => set(next)),
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

type FakeFeed = ReturnType<typeof createFakeFeed>

let continueFeed: () => void = () => {}

function Harness({
  enabled = true,
  feed,
  hidden = new Set(),
  resetKey = 'projects|global',
}: Options & { feed: FakeFeed }) {
  const { results, status } = useSyncExternalStore(feed.subscribe, feed.get)
  const { loadMore, phase } = useExploreFeedPagination({
    enabled,
    paged: { loadMore: feed.loadMore, results, status },
    resetKey,
    visibleItems: results.filter((item) => !hidden.has(item)),
  })
  continueFeed = loadMore

  return (
    <output aria-label="phase">
      {phase.status}
      {'items' in phase ? `:${phase.items.join(',')}` : ''}
      {phase.status === 'ready' ? `:${phase.more}` : ''}
    </output>
  )
}

function setup(initial: Snapshot, options: Options = {}) {
  const feed = createFakeFeed(initial)
  const view = render(<Harness feed={feed} {...options} />)
  return {
    feed,
    loadMore: feed.loadMore,
    phase: () => screen.getByLabelText('phase').textContent,
    rerender: (next: Options) =>
      view.rerender(<Harness feed={feed} {...next} />),
  }
}

/** The in-flight page arrives with `results` loaded in total. */
function arrive(feed: FakeFeed, results: string[]) {
  expect(feed.get().status).toBe('LoadingMore')
  feed.set({ results, status: 'CanLoadMore' })
}

describe('useExploreFeedPagination', () => {
  it('auto-fetches past filtered-empty pages up to the limit, then asks to keep looking', () => {
    const { feed, loadMore, phase } = setup({
      results: [],
      status: 'LoadingFirstPage',
    })
    expect(phase()).toBe('loading')

    // The first page filtered to nothing but the server has more.
    feed.set({ results: [], status: 'CanLoadMore' })
    expect(phase()).toBe('emptyPageWithMore:')
    expect(loadMore).toHaveBeenCalledTimes(1)
    expect(loadMore).toHaveBeenLastCalledWith(EXPLORE_PAGINATED_PAGE_SIZE)

    arrive(feed, [])
    expect(phase()).toBe('emptyPageWithMore:')
    expect(loadMore).toHaveBeenCalledTimes(2)

    arrive(feed, [])
    expect(loadMore).toHaveBeenCalledTimes(EXPLORE_AUTO_FETCH_LIMIT)

    arrive(feed, [])
    expect(phase()).toBe('needsContinuation:')
    expect(feed.get().status).toBe('CanLoadMore')
    expect(loadMore).toHaveBeenCalledTimes(EXPLORE_AUTO_FETCH_LIMIT)

    // "keep looking" spends a fresh budget.
    act(() => continueFeed())
    expect(loadMore).toHaveBeenCalledTimes(EXPLORE_AUTO_FETCH_LIMIT + 1)
    expect(phase()).toBe('emptyPageWithMore:')
    arrive(feed, ['p1'])
    expect(phase()).toBe('ready:p1:available')
    expect(loadMore).toHaveBeenCalledTimes(EXPLORE_AUTO_FETCH_LIMIT + 1)
  })

  it('renders the empty state only when the server is done', () => {
    const { feed, loadMore, phase } = setup({
      results: [],
      status: 'LoadingFirstPage',
    })

    feed.set({ results: [], status: 'Exhausted' })

    expect(phase()).toBe('exhausted')
    expect(loadMore).not.toHaveBeenCalled()
  })

  it('keeps shown rows and fetches on after a viewer load-more page adds nothing', () => {
    const { feed, loadMore, phase } = setup({
      results: ['p1'],
      status: 'CanLoadMore',
    })
    expect(phase()).toBe('ready:p1:available')
    expect(loadMore).not.toHaveBeenCalled()

    act(() => continueFeed())
    expect(phase()).toBe('ready:p1:loading')

    // The requested page filtered to nothing: fetch on, rows stay visible.
    arrive(feed, ['p1'])
    expect(phase()).toBe('emptyPageWithMore:p1')
    expect(loadMore).toHaveBeenCalledTimes(2)

    arrive(feed, ['p1', 'p2'])
    expect(phase()).toBe('ready:p1,p2:available')
    expect(loadMore).toHaveBeenCalledTimes(2)
  })

  it('fetches on when every loaded row is hidden on the client', () => {
    const { loadMore, phase, rerender } = setup({
      results: ['p1'],
      status: 'CanLoadMore',
    })
    expect(loadMore).not.toHaveBeenCalled()

    rerender({ hidden: new Set(['p1']) })

    expect(phase()).toBe('emptyPageWithMore:')
    expect(loadMore).toHaveBeenCalledTimes(1)
  })

  it('keeps loaded pages across a live update without fetching', () => {
    const { feed, loadMore, phase } = setup({
      results: ['p1', 'p2'],
      status: 'CanLoadMore',
    })

    feed.set({ results: ['p0', 'p1', 'p2'], status: 'CanLoadMore' })

    expect(phase()).toBe('ready:p0,p1,p2:available')
    expect(loadMore).not.toHaveBeenCalled()
  })

  it('starts a fresh budget for a new result set and stays idle while skipped', () => {
    const { feed, loadMore, phase, rerender } = setup({
      results: [],
      status: 'LoadingFirstPage',
    })
    feed.set({ results: [], status: 'CanLoadMore' })
    arrive(feed, [])
    arrive(feed, [])
    arrive(feed, [])
    expect(phase()).toBe('needsContinuation:')

    rerender({ enabled: false })
    feed.set({ results: [], status: 'LoadingFirstPage' })
    expect(loadMore).toHaveBeenCalledTimes(EXPLORE_AUTO_FETCH_LIMIT)

    rerender({ resetKey: 'projects|cities|bengaluru' })
    feed.set({ results: [], status: 'CanLoadMore' })
    expect(phase()).toBe('emptyPageWithMore:')
    expect(loadMore).toHaveBeenCalledTimes(EXPLORE_AUTO_FETCH_LIMIT + 1)
  })
})
