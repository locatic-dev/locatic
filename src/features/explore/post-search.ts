export const POST_SEARCH_DEFAULT_LIMIT = 10
export const POST_SEARCH_LIMIT_STEP = 20
export const POST_SEARCH_LOAD_MORE_ACTIONS = {
  browsePage: 'browse-page',
  growSearchLimit: 'grow-search-limit',
} as const

export type PostSearchLoadMoreAction =
  (typeof POST_SEARCH_LOAD_MORE_ACTIONS)[keyof typeof POST_SEARCH_LOAD_MORE_ACTIONS]

export function getNextPostSearchLimit(currentLimit: number) {
  return currentLimit + POST_SEARCH_LIMIT_STEP
}

export function getPostSearchResetKey({
  cityIds,
  mode,
  query,
}: {
  cityIds: string[]
  mode: string
  query: string
}) {
  return [mode, query, cityIds.join('|')].join('\n')
}

export function shouldResetPostSearchLimit({
  currentKey,
  previousKey,
}: {
  currentKey: string
  previousKey: string | null
}) {
  return previousKey !== null && previousKey !== currentKey
}

export function getPostSearchLoadMoreAction({
  isPostSearchActive,
}: {
  isPostSearchActive: boolean
}): PostSearchLoadMoreAction {
  return isPostSearchActive
    ? POST_SEARCH_LOAD_MORE_ACTIONS.growSearchLimit
    : POST_SEARCH_LOAD_MORE_ACTIONS.browsePage
}
