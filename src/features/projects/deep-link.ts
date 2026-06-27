export type ProjectTab = 'posts' | 'readme' | 'releases' | 'discussion'

export const DEEP_LINK_LOAD_MORE_ATTEMPT_LIMIT = 5

export function normalizeProjectSearchParam(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed && trimmed !== 'null' && trimmed !== 'undefined'
    ? trimmed
    : null
}

export function stripProjectCommentSearch<
  TSearch extends Record<string, unknown>,
>(search: TSearch) {
  const { comment, commentPath, thread, ...rest } = search
  void comment
  void commentPath
  void thread
  return rest
}

export function shouldSyncProjectTab({
  hasActiveDeepLinkTarget,
  hasSyncedInitialTab,
}: {
  hasActiveDeepLinkTarget: boolean
  hasSyncedInitialTab: boolean
}) {
  return !hasSyncedInitialTab || hasActiveDeepLinkTarget
}

export function parseCommentPathSearch(commentPath: string | null | undefined) {
  return (commentPath ?? '')
    .split(',')
    .map((commentId) => commentId.trim())
    .filter(Boolean)
}

export function getProjectDeepLinkTab({
  commentId,
  postId,
  postsCount,
}: {
  commentId: string | null
  postId: string | null
  postsCount: number
}): ProjectTab {
  if (postId) {
    return 'posts'
  }

  if (commentId) {
    return 'discussion'
  }

  return postsCount > 0 ? 'posts' : 'readme'
}

export function getCommentExpansionPath({
  commentPath,
  threadId,
}: {
  commentPath: string[]
  threadId: string | null
}) {
  if (commentPath.length > 0) {
    return commentPath
  }

  return threadId ? [threadId] : []
}

export function getActiveHighlightedCommentId({
  rawHighlightedCommentId,
  releasedHighlightId,
}: {
  rawHighlightedCommentId: string | null
  releasedHighlightId: string | null
}) {
  return rawHighlightedCommentId &&
    rawHighlightedCommentId !== releasedHighlightId
    ? rawHighlightedCommentId
    : null
}

export function shouldResetReleasedHighlight({
  rawHighlightedCommentId,
  releasedHighlightId,
}: {
  rawHighlightedCommentId: string | null
  releasedHighlightId: string | null
}) {
  return !rawHighlightedCommentId && releasedHighlightId !== null
}

export function shouldAutoLoadDeepLinkPage({
  attempts,
  isLoaded,
  status,
  targetId,
}: {
  attempts: number
  isLoaded: boolean
  status: string
  targetId: string | null
}) {
  return (
    Boolean(targetId) &&
    status === 'CanLoadMore' &&
    attempts < DEEP_LINK_LOAD_MORE_ATTEMPT_LIMIT &&
    !isLoaded
  )
}
