export type ProjectTab = 'comments' | 'posts' | 'releases'

export const PROJECT_TAB_ORDER: ProjectTab[] = ['comments', 'posts', 'releases']

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
  void postsCount
  if (postId) {
    return 'posts'
  }

  if (commentId) {
    return 'comments'
  }

  return 'comments'
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

const PROJECT_DEEP_LINK_KEYS = ['comment', 'commentPath', 'post', 'thread']

/**
 * The project URL (path and deep-link query) a signed-out visitor returns to
 * after sign-in, so a shared `?comment=` or `?post=` link survives it. The
 * hash is added by the caller on the client.
 */
export function buildProjectReturnHref({
  owner,
  repo,
  search,
}: {
  owner: string
  repo: string
  search: Record<string, unknown>
}) {
  const query = new URLSearchParams()
  for (const key of PROJECT_DEEP_LINK_KEYS) {
    const value = normalizeProjectSearchParam(search[key])
    if (value) query.set(key, value)
  }
  const queryString = query.toString()
  const path = `/project/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`

  return queryString ? `${path}?${queryString}` : path
}
