import { describe, expectTypeOf, it } from 'vitest'
import type {
  ExploreFeedMore,
  ExploreFeedState,
  ExploreFeedStatus,
} from '../feed-state'
import type { BuilderPreview, ExploreProjectPreview } from '../types'

type S = ExploreFeedState

type StateWith<TStatus extends ExploreFeedStatus> = Extract<
  ExploreFeedState,
  { status: TStatus }
>

/**
 * Never called: `pnpm typecheck` fails if any `@ts-expect-error` line below
 * starts to compile, which is how these impossible states stay impossible.
 */
function impossibleFeedStates(
  project: ExploreProjectPreview,
  builder: BuilderPreview,
) {
  const exhausted = {
    mode: 'projects',
    source: 'browse',
    scope: 'global',
    status: 'exhausted',
  } as const
  const ready = { ...exhausted, status: 'ready', more: 'none' } as const
  const search = { mode: 'posts', source: 'search', query: 'maps' } as const

  // @ts-expect-error an exhausted feed has no rows to show
  const exhaustedWithRows: S = { ...exhausted, items: [project] }
  // @ts-expect-error a ready feed always has at least one row
  const readyEmpty: S = { ...ready, items: [] }
  // @ts-expect-error projects mode cannot carry builder rows
  const mixedRows: S = { ...ready, items: [builder] }
  // @ts-expect-error a ready feed must say whether more can load
  const readyNoMore: S = { ...exhausted, status: 'ready', items: [project] }
  // @ts-expect-error a loading feed has no load-more affordance
  const loadingMore: S = { ...exhausted, status: 'loading', more: 'none' }
  // @ts-expect-error a bounded search never needs continuation
  const endless: S = { ...search, status: 'needsContinuation', items: [] }
  // @ts-expect-error browse read errors go to the route error boundary
  const browseError: S = { ...exhausted, status: 'error' }
  // @ts-expect-error a browse feed always names its scope
  const unscoped: S = { mode: 'builders', source: 'browse', status: 'loading' }
  // @ts-expect-error a search always carries its query
  const noQuery: S = { mode: 'posts', source: 'search', status: 'loading' }

  return [
    exhaustedWithRows,
    readyEmpty,
    mixedRows,
    readyNoMore,
    loadingMore,
    endless,
    browseError,
    unscoped,
    noQuery,
  ]
}

describe('ExploreFeedState', () => {
  it('is the single union of feed statuses', () => {
    expectTypeOf<ExploreFeedStatus>().toEqualTypeOf<
      | 'loading'
      | 'ready'
      | 'emptyPageWithMore'
      | 'needsContinuation'
      | 'exhausted'
      | 'error'
    >()
    expectTypeOf<StateWith<'ready'>['more']>().toEqualTypeOf<ExploreFeedMore>()
  })

  it('narrows rows by mode and keeps errors and continuation on their sources', () => {
    expectTypeOf<
      Extract<StateWith<'ready'>, { mode: 'builders' }>['items'][number]
    >().toEqualTypeOf<BuilderPreview>()
    expectTypeOf<StateWith<'error'>['source']>().toEqualTypeOf<'search'>()
    expectTypeOf<
      StateWith<'needsContinuation' | 'emptyPageWithMore'>['source']
    >().toEqualTypeOf<'browse'>()
    expectTypeOf(impossibleFeedStates).toBeFunction()
  })
})
