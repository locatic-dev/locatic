export type HomeFeedRenderState = 'empty' | 'items' | 'loading'

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

export function getHomeFeedRenderState({
  itemCount,
  status,
}: {
  itemCount: number
  status: string
}): HomeFeedRenderState {
  if (status === 'LoadingFirstPage' && itemCount === 0) {
    return 'loading'
  }

  if (itemCount === 0) {
    return 'empty'
  }

  return 'items'
}
