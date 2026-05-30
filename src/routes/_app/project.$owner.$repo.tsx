import { useAuth } from '@clerk/tanstack-react-start'
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import {
  createFileRoute,
  useCanGoBack,
  useRouter,
} from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import { projectDetailQueryOptions } from '@/features/projects/queries'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { LangDot } from '@/components/ui/lang-dot'
import { StatusPill } from '@/components/ui/status-pill'
import { CityPill } from '@/components/ui/city-pill'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { relativeTime } from '@/lib/time'
import { compactNumber } from '@/lib/format'
import {
  Star,
  Heart,
  MessageSquare,
  ArrowLeft,
  ExternalLink,
  CornerUpLeft,
  Trash2,
} from '@/lib/icons'
import {
  useLikeProject,
  useUnlikeProject,
  useAddComment,
  useDeleteComment,
  useReactToTarget,
  useUnreactFromTarget,
} from '@/features/projects/mutations'
import { showGithubSyncFeedback } from '@/features/projects/github-sync-feedback'
import { useFollowUser, useUnfollowUser } from '@/features/follows/mutations'
import {
  mapProjectDetail,
  mapViewerSummary,
  type ProjectDetailPayload,
  type ViewerSummaryPayload,
} from '@/features/contracts'
import { socialLinkHref } from '@/lib/social-links'
import { useOpenConversation } from '@/features/inbox/use-open-conversation'
import { viewerSummaryQueryOptions } from '@/features/viewer/queries'

function updateProjectLikePayload(
  payload: ProjectDetailPayload | null | undefined,
  nextLiked: boolean,
) {
  if (!payload) {
    return payload
  }

  const delta = nextLiked === payload.viewerHasLiked ? 0 : nextLiked ? 1 : -1

  return {
    ...payload,
    viewerHasLiked: nextLiked,
    project: {
      ...payload.project,
      locatic: {
        ...payload.project.locatic,
        likesCount: Math.max(0, payload.project.locatic.likesCount + delta),
      },
    },
  }
}

function updateProjectFollowPayload(
  payload: ProjectDetailPayload | null | undefined,
  nextFollowed: boolean,
) {
  if (!payload) {
    return payload
  }

  return {
    ...payload,
    viewerFollowsOwner: nextFollowed,
  }
}

function updateCommentLikeState<
  TComment extends {
    _id: unknown
    likesCount: number
    viewerHasLiked: boolean
  },
>(comment: TComment, targetId: string, nextLiked: boolean): TComment {
  if (String(comment._id) !== targetId) {
    return comment
  }

  const delta = nextLiked === comment.viewerHasLiked ? 0 : nextLiked ? 1 : -1

  return {
    ...comment,
    likesCount: comment.likesCount + delta,
    viewerHasLiked: nextLiked,
  }
}

function updateCommentLikePayload(
  payload: ProjectDetailPayload | null | undefined,
  targetId: string,
  nextLiked: boolean,
) {
  if (!payload) {
    return payload
  }

  const updateComment = (
    comment: ProjectDetailPayload['comments'][number],
  ): ProjectDetailPayload['comments'][number] => ({
    ...updateCommentLikeState(comment, targetId, nextLiked),
    replies: comment.replies.map(updateComment),
  })

  return {
    ...payload,
    comments: payload.comments.map(updateComment),
  }
}

export const Route = createFileRoute('/_app/project/$owner/$repo')({
  validateSearch: (search: Record<string, unknown>) => ({
    comment: typeof search.comment === 'string' ? search.comment : null,
  }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      projectDetailQueryOptions(`${params.owner}/${params.repo}`),
    )

    if (context.auth.isAuthenticated) {
      await context.queryClient.ensureQueryData(viewerSummaryQueryOptions())
    }
  },
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { owner, repo } = Route.useParams()
  const { comment: highlightedCommentId } = Route.useSearch()
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const { isSignedIn } = useAuth()
  const queryClient = useQueryClient()
  const likeProject = useLikeProject()
  const unlikeProject = useUnlikeProject()
  const addComment = useAddComment()
  const deleteComment = useDeleteComment()
  const reactToTarget = useReactToTarget()
  const unreactFromTarget = useUnreactFromTarget()
  const followUser = useFollowUser()
  const unfollowUser = useUnfollowUser()
  const { openConversation, pendingUserId } = useOpenConversation()

  const fullName = `${owner}/${repo}`
  const { data } = useSuspenseQuery(projectDetailQueryOptions(fullName))
  const viewerSummaryQuery = useQuery({
    ...viewerSummaryQueryOptions(),
    enabled: isSignedIn,
  })
  const viewer = mapViewerSummary(
    viewerSummaryQuery.data as ViewerSummaryPayload | undefined,
  )
  const detail = mapProjectDetail(
    data as ProjectDetailPayload | null | undefined,
  )
  const projectDetailQueryKey = projectDetailQueryOptions(fullName).queryKey

  const [comment, setComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(
    new Set(),
  )
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [hashCommentId, setHashCommentId] = useState<string | null>(null)
  const commentRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const likeMutation = useMutation({
    mutationFn: async ({
      currentlyLiked,
      projectId,
    }: {
      currentlyLiked: boolean
      projectId: ProjectDetailPayload['project']['_id']
    }) =>
      currentlyLiked
        ? unlikeProject({ projectId })
        : likeProject({ projectId }),
    onMutate: async ({ currentlyLiked }) => {
      await queryClient.cancelQueries({ queryKey: projectDetailQueryKey })
      const previous = queryClient.getQueryData<ProjectDetailPayload | null>(
        projectDetailQueryKey,
      )

      queryClient.setQueryData<ProjectDetailPayload | null>(
        projectDetailQueryKey,
        (current) => updateProjectLikePayload(current, !currentlyLiked) ?? null,
      )

      return { previous }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(projectDetailQueryKey, context?.previous ?? null)
    },
    onSuccess: (result) => {
      showGithubSyncFeedback(result)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: projectDetailQueryKey })
    },
  })

  const followMutation = useMutation({
    mutationFn: async ({
      currentlyFollowed,
      userId,
    }: {
      currentlyFollowed: boolean
      userId: ProjectDetailPayload['owner']['userId']
    }) =>
      currentlyFollowed
        ? unfollowUser({ targetUserId: userId })
        : followUser({ targetUserId: userId }),
    onMutate: async ({ currentlyFollowed }) => {
      await queryClient.cancelQueries({ queryKey: projectDetailQueryKey })
      const previous = queryClient.getQueryData<ProjectDetailPayload | null>(
        projectDetailQueryKey,
      )

      queryClient.setQueryData<ProjectDetailPayload | null>(
        projectDetailQueryKey,
        (current) =>
          updateProjectFollowPayload(current, !currentlyFollowed) ?? null,
      )

      return { previous }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(projectDetailQueryKey, context?.previous ?? null)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: projectDetailQueryKey })
    },
  })

  const commentLikeMutation = useMutation({
    mutationFn: async ({
      commentId,
      currentlyLiked,
    }: {
      commentId: string
      currentlyLiked: boolean
    }) =>
      currentlyLiked
        ? unreactFromTarget({
            reactionType: 'like',
            targetId: commentId,
            targetType: 'comment',
          })
        : reactToTarget({
            reactionType: 'like',
            targetId: commentId,
            targetType: 'comment',
          }),
    onMutate: async ({ commentId, currentlyLiked }) => {
      await queryClient.cancelQueries({ queryKey: projectDetailQueryKey })
      const previous = queryClient.getQueryData<ProjectDetailPayload | null>(
        projectDetailQueryKey,
      )

      queryClient.setQueryData<ProjectDetailPayload | null>(
        projectDetailQueryKey,
        (current) =>
          updateCommentLikePayload(current, commentId, !currentlyLiked) ?? null,
      )

      return { previous }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(projectDetailQueryKey, context?.previous ?? null)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: projectDetailQueryKey })
    },
  })

  if (!detail) {
    return <div className="p-8 text-text-muted">project not found.</div>
  }

  const liked = detail.viewerHasLiked
  const followed = detail.viewerFollowsOwner
  const githubStars = detail.project.github.stargazersCount
  const locaticLikes = detail.project.locatic.likesCount
  const comments = detail.comments.filter(
    (commentItem) => !commentItem.isDeleted,
  )
  const description =
    detail.project.github.description || 'no project description provided yet.'
  const readmePreview =
    detail.project.github.readmePreview ||
    description ||
    `# ${detail.project.github.name}`
  const isOwnProject = viewer?.id === String(detail.owner.userId)
  const githubHref = `https://github.com/${detail.project.github.fullName}`
  const ownerGithubHref = socialLinkHref('github', detail.owner.githubUsername)
  const ownerXHref = socialLinkHref('x', detail.owner.socialLinks.x)
  const ownerLinkedinHref = socialLinkHref(
    'linkedin',
    detail.owner.socialLinks.linkedin,
  )
  const ownerWebsiteHref = socialLinkHref(
    'website',
    detail.owner.socialLinks.website,
  )
  const pendingCommentLikeId = commentLikeMutation.variables?.commentId ?? null

  const handleLike = async () => {
    if (likeMutation.isPending || !isSignedIn) {
      return
    }

    try {
      await likeMutation.mutateAsync({
        currentlyLiked: liked,
        projectId: detail.project._id,
      })
    } catch (error) {
      console.error(error)
    }
  }

  const handleFollow = async () => {
    if (followMutation.isPending || !isSignedIn || isOwnProject) {
      return
    }

    try {
      await followMutation.mutateAsync({
        currentlyFollowed: followed,
        userId: detail.owner.userId,
      })
    } catch (error) {
      console.error(error)
    }
  }

  const handlePostComment = async () => {
    if (!comment.trim() || postingComment || !isSignedIn) {
      return
    }

    setPostingComment(true)

    try {
      await addComment({
        content: comment.trim(),
        parentId: null,
        targetId: String(detail.project._id),
        targetType: 'project',
      })
      setComment('')
      await queryClient.invalidateQueries({
        queryKey: projectDetailQueryKey,
      })
    } catch (error) {
      console.error(error)
    } finally {
      setPostingComment(false)
    }
  }

  const handleReply = async (parentId: Id<'comments'>) => {
    const parentKey = String(parentId)
    const draft = replyDrafts[parentKey]?.trim() ?? ''
    if (!draft || replyingToId === parentKey || !isSignedIn) {
      return
    }

    setReplyingToId(parentKey)
    try {
      await addComment({
        content: draft,
        parentId,
        targetId: String(detail.project._id),
        targetType: 'project',
      })
      setReplyDrafts((current) => ({
        ...current,
        [parentKey]: '',
      }))
      await queryClient.invalidateQueries({
        queryKey: projectDetailQueryKey,
      })
    } catch (error) {
      console.error(error)
    } finally {
      setReplyingToId(null)
    }
  }

  const handleToggleCommentLike = async (
    commentId: string,
    currentlyLiked: boolean,
  ) => {
    if (
      !isSignedIn ||
      (commentLikeMutation.isPending && pendingCommentLikeId === commentId)
    ) {
      return
    }

    try {
      await commentLikeMutation.mutateAsync({
        commentId,
        currentlyLiked,
      })
    } catch (error) {
      console.error(error)
    }
  }

  const handleDeleteComment = async (commentId: Id<'comments'>) => {
    const commentKey = String(commentId)
    if (pendingDeleteIds.has(commentKey)) {
      return
    }

    setPendingDeleteIds((current) => new Set(current).add(commentKey))
    try {
      await deleteComment({ commentId })
      await queryClient.invalidateQueries({
        queryKey: projectDetailQueryKey,
      })
    } catch (error) {
      console.error(error)
    } finally {
      setPendingDeleteIds((current) => {
        const next = new Set(current)
        next.delete(commentKey)
        return next
      })
    }
  }

  useEffect(() => {
    const syncHashComment = () => {
      const hash = window.location.hash.replace(/^#/, '')
      setHashCommentId(hash.startsWith('comment-') ? hash.slice(8) : null)
    }

    syncHashComment()
    window.addEventListener('hashchange', syncHashComment)

    return () => window.removeEventListener('hashchange', syncHashComment)
  }, [])

  const activeHighlightedCommentId = highlightedCommentId ?? hashCommentId

  useEffect(() => {
    if (!activeHighlightedCommentId) {
      return
    }

    const commentElement = commentRefs.current[activeHighlightedCommentId]
    if (!commentElement) {
      return
    }

    commentElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [activeHighlightedCommentId, comments.length])

  const stats = [
    {
      accent: false,
      fill: false,
      icon: Star,
      label: 'github stars',
      value: compactNumber(githubStars),
    },
    {
      accent: true,
      fill: liked,
      icon: Heart,
      label: 'likes',
      value: compactNumber(locaticLikes),
    },
    {
      accent: false,
      fill: false,
      icon: MessageSquare,
      label: 'comments',
      value: String(detail.project.locatic.commentsCount),
    },
  ]
  const languages =
    detail.project.github.languages &&
    detail.project.github.languages.length > 0
      ? detail.project.github.languages
      : detail.project.github.primaryLanguage
        ? [{ name: detail.project.github.primaryLanguage, bytes: 0 }]
        : []

  const renderComment = (
    commentItem: ProjectDetailPayload['comments'][number],
    depth = 0,
  ) => {
    if (commentItem.isDeleted && commentItem.replies.length === 0) {
      return null
    }

    const commentId = String(commentItem._id)
    const commentLiked = commentItem.viewerHasLiked
    const commentLikes = commentItem.likesCount
    const canDelete = viewer?.id === String(commentItem.authorId)
    const visibleReplies = commentItem.replies.filter(
      (reply) => !reply.isDeleted || reply.replies.length > 0,
    )
    const nested = depth > 0

    return (
      <div
        key={commentId}
        id={`comment-${commentId}`}
        ref={(node) => {
          commentRefs.current[commentId] = node
        }}
        className={`rounded-[6px] border border-line px-4 py-4 ${
          activeHighlightedCommentId === commentId
            ? 'bg-brand-quiet'
            : nested
              ? 'bg-surface'
              : 'bg-transparent'
        }`}
      >
        <div className="flex gap-3">
          <LxAvatar
            name={commentItem.authorSnapshot.displayName}
            avatarUrl={commentItem.authorSnapshot.avatarUrl}
            size={nested ? 28 : 32}
          />
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-[12.5px] font-semibold text-text">
                {commentItem.authorSnapshot.displayName}
              </span>
              {!nested && commentItem.authorSnapshot.cityName && (
                <CityPill city={commentItem.authorSnapshot.cityName} />
              )}
              <span className="font-mono text-[11px] text-text-faint">
                {relativeTime(commentItem.createdAt)}
              </span>
            </div>
            <p className="m-0 font-sans text-[13.5px] leading-[1.6] text-text">
              {commentItem.content}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[11px] text-text-faint">
              <button
                type="button"
                onClick={() =>
                  void handleToggleCommentLike(commentId, commentLiked)
                }
                aria-label={commentLiked ? 'Unlike comment' : 'Like comment'}
                aria-pressed={commentLiked}
                disabled={
                  (commentLikeMutation.isPending &&
                    pendingCommentLikeId === commentId) ||
                  !isSignedIn
                }
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 py-2 ${
                  commentLiked ? 'text-brand' : 'text-inherit'
                }`}
              >
                <Heart
                  size={13}
                  fill={commentLiked ? 'currentColor' : 'none'}
                  strokeWidth={1.6}
                />
                <span>{commentLikes}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setReplyDrafts((current) => ({
                    ...current,
                    [commentId]: current[commentId] ?? '',
                  }))
                }
                aria-label="Reply to comment"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 py-2 text-inherit"
              >
                <CornerUpLeft size={13} strokeWidth={1.6} />
                <span>reply</span>
              </button>
              {visibleReplies.length > 0 && (
                <span>
                  {visibleReplies.length}{' '}
                  {visibleReplies.length === 1 ? 'reply' : 'replies'}
                </span>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => void handleDeleteComment(commentItem._id)}
                  disabled={pendingDeleteIds.has(commentId)}
                  aria-label="Delete comment"
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 py-2 text-inherit"
                >
                  <Trash2 size={13} strokeWidth={1.6} />
                  <span>
                    {pendingDeleteIds.has(commentId) ? 'deleting…' : 'delete'}
                  </span>
                </button>
              )}
            </div>

            {replyDrafts[commentId] !== undefined && isSignedIn && (
              <div className="mt-3 flex flex-wrap gap-3 rounded-[6px] border border-line bg-surface px-3 py-3">
                <Textarea
                  value={replyDrafts[commentId] ?? ''}
                  onChange={(event) =>
                    setReplyDrafts((current) => ({
                      ...current,
                      [commentId]: event.target.value,
                    }))
                  }
                  rows={2}
                  placeholder={`reply to ${commentItem.authorSnapshot.displayName}…`}
                  className="min-h-18 flex-1 resize-none border-0 bg-transparent px-0 py-0 font-sans text-[13px] text-text shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <div className="flex items-end gap-2">
                  <Button
                    variant="monoOutline"
                    size="meta"
                    onClick={() =>
                      setReplyDrafts((current) => {
                        const next = { ...current }
                        delete next[commentId]
                        return next
                      })
                    }
                    className="font-mono"
                  >
                    cancel
                  </Button>
                  <Button
                    variant="brand"
                    size="meta"
                    onClick={() => void handleReply(commentItem._id)}
                    disabled={
                      !(replyDrafts[commentId] ?? '').trim() ||
                      replyingToId === commentId
                    }
                    className="font-mono"
                  >
                    {replyingToId === commentId ? 'posting…' : 'reply'}
                  </Button>
                </div>
              </div>
            )}

            {visibleReplies.length > 0 && (
              <div
                className={`mt-4 flex flex-col gap-3 border-l border-line ${
                  depth >= 2 ? 'pl-3 sm:pl-4' : 'pl-4'
                }`}
              >
                {visibleReplies.map((reply) => renderComment(reply, depth + 1))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="lx-page-shell flex flex-col bg-canvas">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas px-(--lx-gutter) py-3">
        <button
          onClick={() => {
            if (canGoBack) {
              router.history.back()
            } else {
              void router.navigate({ to: isSignedIn ? '/home' : '/' })
            }
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-transparent px-2 py-2 font-mono text-[12px] text-text-muted transition-colors hover:text-text"
          type="button"
        >
          <ArrowLeft size={14} /> back
        </button>

        <div className="flex flex-wrap gap-2">
          {!isOwnProject && (
            <Button
              variant="monoOutline"
              size="meta"
              onClick={() => void openConversation(detail.owner.userId)}
              disabled={pendingUserId === String(detail.owner.userId)}
              className="font-mono"
            >
              {pendingUserId === String(detail.owner.userId)
                ? 'opening…'
                : 'message'}
            </Button>
          )}
          <Button
            variant={liked ? 'brand' : 'monoOutline'}
            size="meta"
            onClick={() => void handleLike()}
            disabled={likeMutation.isPending || !isSignedIn}
            className="font-mono"
          >
            <Heart
              size={13}
              fill={liked ? 'currentColor' : 'none'}
              strokeWidth={1.6}
            />
            {liked ? 'liked' : 'like'}
          </Button>
          {!isOwnProject && (
            <Button
              variant="monoOutline"
              size="meta"
              onClick={() => void handleFollow()}
              disabled={followMutation.isPending || !isSignedIn}
              className="font-mono"
            >
              {followMutation.isPending
                ? 'working…'
                : followed
                  ? 'following'
                  : 'follow'}
            </Button>
          )}
        </div>
      </div>

      <div className="lx-page-scroll flex-1">
        <div className="lx-page-width-detail pt-2">
          <div className="mb-8 grid gap-6 border-b border-line pb-7 lg:grid-cols-[minmax(0,1.2fr)_320px] lg:items-start">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className="font-mono text-[12px] text-text-faint">
                  {owner}
                </span>
                <a
                  href={githubHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1.5 px-0 py-2 font-mono text-[11.5px] text-text-muted no-underline transition-colors hover:text-text"
                >
                  <ExternalLink size={12} />
                  view on GitHub
                </a>
              </div>

              <h1 className="mb-3 font-mono text-[clamp(30px,4vw,42px)] font-bold tracking-tight text-text wrap-anywhere">
                {repo}
              </h1>

              <p className="mb-6 max-w-170 font-sans text-base leading-[1.55] text-text-muted">
                {description}
              </p>

              <div className="mb-5 flex flex-wrap items-center gap-6">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <div className="flex items-baseline gap-1.5">
                      <stat.icon
                        size={14}
                        strokeWidth={1.4}
                        fill={stat.fill ? 'currentColor' : 'none'}
                        className={
                          stat.accent ? 'text-brand' : 'text-text-muted'
                        }
                      />
                      <span className="font-mono text-[22px] font-semibold tracking-[-0.02em] text-text [font-variant-numeric:tabular-nums]">
                        {stat.value}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono text-[10.5px] lowercase text-text-faint">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2.5 font-mono text-[11.5px] text-text-faint">
                {languages.map((language) => (
                  <LangDot key={language.name} lang={language.name} showLabel />
                ))}
                <span>
                  updated {relativeTime(detail.project.github.lastCommitAt)}
                </span>
              </div>
            </div>

            <div className="rounded-[6px] border border-line bg-surface p-4.5">
              <button
                type="button"
                onClick={() =>
                  void router.navigate({
                    to: '/u/$username',
                    params: {
                      username: detail.owner.githubUsername,
                    },
                    search: { tab: 'projects' },
                  })
                }
                className="mb-3.5 flex w-full items-center gap-3 border-0 bg-transparent p-0 text-left"
              >
                <LxAvatar
                  name={detail.owner.displayName}
                  avatarUrl={detail.owner.avatarUrl}
                  size={48}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm font-semibold text-text">
                    {detail.owner.displayName}
                  </div>
                  <div className="font-mono text-[11.5px] text-text-faint">
                    @{detail.owner.githubUsername}
                  </div>
                </div>
              </button>

              <div className="mb-3.5 flex flex-wrap gap-2.5">
                <StatusPill status={detail.owner.buildStatus} size="md" />
                {detail.owner.city && <CityPill city={detail.owner.city} />}
              </div>

              <div className="flex flex-wrap gap-2.5 font-mono text-[11.5px]">
                {ownerGithubHref && (
                  <a
                    href={ownerGithubHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-muted no-underline"
                  >
                    github
                  </a>
                )}
                {ownerXHref && (
                  <a
                    href={ownerXHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-muted no-underline"
                  >
                    x
                  </a>
                )}
                {ownerLinkedinHref && (
                  <a
                    href={ownerLinkedinHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-muted no-underline"
                  >
                    linkedin
                  </a>
                )}
                {ownerWebsiteHref && (
                  <a
                    href={ownerWebsiteHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-muted no-underline"
                  >
                    site
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              <div className="mb-8 overflow-hidden rounded-[6px] border border-line bg-surface">
                <div className="flex items-center justify-between border-b border-line bg-surface-alt px-4 py-2.5 font-mono text-[11.5px]">
                  <span className="text-text-muted">README.md</span>
                  <span className="text-text-faint">repo overview</span>
                </div>
                <div className="flex flex-col gap-3.5 px-7 py-6">
                  {readmePreview.split('\n\n').map((block, index) => {
                    if (block.startsWith('# ')) {
                      return (
                        <h1
                          key={index}
                          className="m-0 font-mono text-[22px] font-bold tracking-[-0.02em] text-text"
                        >
                          {block.slice(2)}
                        </h1>
                      )
                    }

                    if (block.startsWith('## ')) {
                      return (
                        <h2
                          key={index}
                          className="mt-2 border-b border-line pb-1.5 font-mono text-sm font-semibold text-text-muted"
                        >
                          {block.slice(3)}
                        </h2>
                      )
                    }

                    if (block.startsWith('`')) {
                      return (
                        <pre
                          key={index}
                          className="m-0 overflow-x-auto whitespace-pre-wrap rounded bg-canvas px-3.5 py-3 font-mono text-[12.5px] leading-[1.6] text-text"
                        >
                          {block.replace(/`/g, '')}
                        </pre>
                      )
                    }

                    return (
                      <p
                        key={index}
                        className="m-0 font-sans text-sm leading-[1.65] text-text-muted"
                      >
                        {block}
                      </p>
                    )
                  })}
                </div>
              </div>

              <div>
                <div className="mb-3.5 font-mono text-[11px] uppercase tracking-[0.06em] text-text-faint">
                  // comments · {detail.project.locatic.commentsCount}
                </div>

                {isSignedIn ? (
                  <div className="mb-4 flex flex-wrap gap-3 rounded-[6px] border border-line bg-surface px-3.5 py-3">
                    <Textarea
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder="say something thoughtful…"
                      rows={2}
                      className="min-h-18 flex-1 resize-none border-0 bg-transparent px-0 py-0 font-sans text-[13.5px] text-text shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    <Button
                      variant="brand"
                      size="meta"
                      onClick={() => void handlePostComment()}
                      disabled={!comment.trim() || postingComment}
                      className="self-end font-mono font-semibold"
                    >
                      {postingComment ? '…' : 'post'}
                    </Button>
                  </div>
                ) : (
                  <div className="mb-4 rounded-[6px] border border-line bg-surface px-3.5 py-3 font-mono text-[12.5px] text-text-faint">
                    <a href="/sign-in/$" className="text-brand no-underline">
                      sign in
                    </a>{' '}
                    to leave a comment.
                  </div>
                )}

                {comments.length === 0 ? (
                  <div className="py-4 font-sans text-sm text-text-muted">
                    no comments yet.
                  </div>
                ) : (
                  comments.map((commentItem) => renderComment(commentItem))
                )}
              </div>
            </div>

            <aside className="flex flex-col gap-5">
              {detail.likedByPreview.length > 0 && (
                <div className="rounded-[6px] border border-line bg-surface p-4.5">
                  <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.06em] text-text-faint">
                    liked by
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detail.likedByPreview.map((user) => (
                      <button
                        key={String(user.userId)}
                        type="button"
                        onClick={() =>
                          void router.navigate({
                            to: '/u/$username',
                            params: { username: user.githubUsername },
                            search: { tab: 'projects' },
                          })
                        }
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-pill border border-line bg-canvas px-2.5 py-1.5 font-mono text-[11.5px] text-text-muted"
                      >
                        <LxAvatar
                          name={user.displayName}
                          avatarUrl={user.avatarUrl}
                          size={18}
                        />
                        {user.displayName}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-[6px] border border-line bg-surface p-4.5">
                <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.06em] text-text-faint">
                  recent updates
                </div>

                {detail.updates.length === 0 ? (
                  <div className="font-sans text-[13px] text-text-muted">
                    no updates yet.
                  </div>
                ) : (
                  detail.updates.slice(0, 4).map((update) => (
                    <div
                      key={String(update._id)}
                      className="mt-3 border-t border-line pt-3"
                    >
                      <div className="mb-1 font-mono text-xs font-semibold text-text">
                        {update.versionTag ? `${update.versionTag} · ` : ''}
                        {update.title}
                      </div>
                      <div className="font-sans text-[12.5px] leading-normal text-text-muted">
                        {update.description}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
