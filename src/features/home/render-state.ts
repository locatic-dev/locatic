export type HomeFeedRenderState = 'empty' | 'items' | 'loading'

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
