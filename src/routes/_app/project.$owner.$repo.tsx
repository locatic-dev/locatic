import { useAuth } from '@clerk/tanstack-react-start'
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { usePaginatedQuery } from 'convex/react'
import {
  createFileRoute,
  useCanGoBack,
  useRouter,
} from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { projectDetailQueryOptions } from '@/features/projects/queries'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { LangDot } from '@/components/ui/lang-dot'
import { StatusPill } from '@/components/ui/status-pill'
import { CityPill } from '@/components/ui/city-pill'
import { BrandIcon } from '@/components/ui/brand-icon'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { relativeTime } from '@/lib/time'
import { compactNumber } from '@/lib/format'
import {
  Star,
  Heart,
  MessageSquare,
  ArrowLeft,
  ExternalLink,
  Plus,
  X,
} from '@/lib/icons'
import {
  useLikeProject,
  useUnlikeProject,
  useAddComment,
  useDeleteComment,
  useReactToTarget,
  useUnreactFromTarget,
  useUpdateProjectTopics,
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
import { CommentThread } from '@/features/projects/comments/comment-thread'
import { useCommentThreadState } from '@/features/projects/comments/use-comment-thread-state'
import type {
  ProjectCommentLikeOverride,
  ProjectCommentView,
} from '@/features/projects/comments/types'
import { ProjectPostsSection } from '@/features/projects/posts/project-posts-section'

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
  const updateProjectTopics = useUpdateProjectTopics()
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
  const commentRoots = usePaginatedQuery(
    api.comments.listRootsByTarget,
    detail
      ? {
          targetId: String(detail.project._id),
          targetType: 'project',
          sort: 'newest',
        }
      : 'skip',
    { initialNumItems: 10 },
  )

  const [comment, setComment] = useState('')
  const [topicDraft, setTopicDraft] = useState('')
  const [pendingTopics, setPendingTopics] = useState(false)
  const [commentComposerOpen, setCommentComposerOpen] = useState(false)
  const [postingComment, setPostingComment] = useState(false)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(
    new Set(),
  )
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [hashCommentId, setHashCommentId] = useState<string | null>(null)
  const commentRefs = useRef<Record<string, HTMLElement | null>>({})
  const {
    expand: expandCommentThread,
    expandedIds,
    toggle: toggleCommentThread,
  } = useCommentThreadState()
  const [pendingReplies, setPendingReplies] = useState<
    Record<string, ProjectCommentView[]>
  >({})
  const [commentLikeOverrides, setCommentLikeOverrides] = useState<
    Record<string, ProjectCommentLikeOverride>
  >({})
  const [pendingCommentLikeId, setPendingCommentLikeId] = useState<
    string | null
  >(null)

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

  if (!detail) {
    return <div className="p-8 text-text-muted">project not found.</div>
  }

  const liked = detail.viewerHasLiked
  const followed = detail.viewerFollowsOwner
  const githubStars = detail.project.github.stargazersCount
  const locaticLikes = detail.project.locatic.likesCount
  const comments = (commentRoots.results ?? []) as ProjectCommentView[]
  const visibleRootComments = comments.filter(
    (commentItem) => !commentItem.isDeleted || commentItem.replyCount > 0,
  )
  const description =
    detail.project.github.description || 'no project description provided yet.'
  const readmePreview =
    detail.project.github.readmePreview ||
    description ||
    `# ${detail.project.github.name}`
  const isOwnProject = viewer?.id === String(detail.owner.userId)
  const projectTopics =
    detail.project.locatic.tags.length > 0
      ? detail.project.locatic.tags
      : detail.project.github.topics
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

  const handleAddTopic = async () => {
    const topic = topicDraft.trim()
    if (!topic || pendingTopics || !isOwnProject) {
      return
    }

    const nextTopics = [...projectTopics, topic]
    setPendingTopics(true)
    try {
      await updateProjectTopics({
        projectId: detail.project._id,
        topics: nextTopics,
      })
      setTopicDraft('')
      await queryClient.invalidateQueries({ queryKey: projectDetailQueryKey })
    } catch (error) {
      console.error(error)
    } finally {
      setPendingTopics(false)
    }
  }

  const handleRemoveTopic = async (topic: string) => {
    if (pendingTopics || !isOwnProject) {
      return
    }

    setPendingTopics(true)
    try {
      await updateProjectTopics({
        projectId: detail.project._id,
        topics: projectTopics.filter((item) => item !== topic),
      })
      await queryClient.invalidateQueries({ queryKey: projectDetailQueryKey })
    } catch (error) {
      console.error(error)
    } finally {
      setPendingTopics(false)
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
      setCommentComposerOpen(false)
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
    if (!draft || replyingToId === parentKey || !isSignedIn || !viewer) {
      return
    }

    setReplyingToId(parentKey)
    expandCommentThread(parentKey)
    const pendingReplyId = `pending-${parentKey}-${Date.now()}`
    const pendingReply: ProjectCommentView = {
      _creationTime: Date.now(),
      _id: pendingReplyId,
      authorId: viewer.id,
      authorSnapshot: {
        avatarUrl: '',
        cityId: null,
        cityName: null,
        displayName: 'you',
      },
      content: draft,
      createdAt: Date.now(),
      isDeleted: false,
      likesCount: 0,
      parentId,
      pending: true,
      replyCount: 0,
      replies: [],
      targetId: String(detail.project._id),
      targetSnapshot: {
        projectFullName: detail.project.github.fullName,
        projectOwner: owner,
        projectRepo: repo,
        targetLabel: detail.project.github.fullName,
        updateTitle: null,
      },
      targetType: 'project',
      viewerHasLiked: false,
    }
    setPendingReplies((current) => ({
      ...current,
      [parentKey]: [...(current[parentKey] ?? []), pendingReply],
    }))

    try {
      await addComment({
        content: draft,
        parentId,
        targetId: String(detail.project._id),
        targetType: 'project',
      })
      setReplyDrafts((current) => {
        const next = { ...current }
        delete next[parentKey]
        return next
      })
      await queryClient.invalidateQueries({
        queryKey: projectDetailQueryKey,
      })
    } catch (error) {
      console.error(error)
    } finally {
      setPendingReplies((current) => {
        const nextReplies = (current[parentKey] ?? []).filter(
          (reply) => reply._id !== pendingReplyId,
        )
        return {
          ...current,
          [parentKey]: nextReplies,
        }
      })
      setReplyingToId(null)
    }
  }

  const handleToggleCommentLike = async (
    commentId: string,
    currentlyLiked: boolean,
    likesCount: number,
  ) => {
    if (!isSignedIn || pendingCommentLikeId === commentId) {
      return
    }

    const nextLiked = !currentlyLiked
    const nextLikesCount = Math.max(0, likesCount + (nextLiked ? 1 : -1))
    setCommentLikeOverrides((current) => ({
      ...current,
      [commentId]: {
        likesCount: nextLikesCount,
        viewerHasLiked: nextLiked,
      },
    }))
    setPendingCommentLikeId(commentId)

    try {
      if (currentlyLiked) {
        await unreactFromTarget({
          reactionType: 'like',
          targetId: commentId,
          targetType: 'comment',
        })
      } else {
        await reactToTarget({
          reactionType: 'like',
          targetId: commentId,
          targetType: 'comment',
        })
      }
      window.setTimeout(() => {
        setCommentLikeOverrides((current) => {
          const next = { ...current }
          delete next[commentId]
          return next
        })
      }, 1200)
    } catch (error) {
      console.error(error)
      setCommentLikeOverrides((current) => {
        const next = { ...current }
        delete next[commentId]
        return next
      })
    } finally {
      setPendingCommentLikeId(null)
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

  const languages =
    detail.project.github.languages &&
    detail.project.github.languages.length > 0
      ? detail.project.github.languages
      : detail.project.github.primaryLanguage
        ? [{ name: detail.project.github.primaryLanguage, bytes: 0 }]
        : []

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
      </div>

      <div className="lx-page-scroll flex-1">
        <div className="lx-page-width-detail pt-2">
          <div className="mb-8 grid gap-6 border-b border-line pb-7 lg:grid-cols-[minmax(0,1.2fr)_320px] lg:items-start">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className="font-mono text-[12px] text-text-faint">
                  {owner}
                </span>
                <span className="font-mono text-[12px] text-text-faint">
                  imported from GitHub
                </span>
              </div>

              <h1 className="mb-3 font-mono text-[clamp(30px,4vw,42px)] font-bold tracking-tight text-text wrap-anywhere">
                {repo}
              </h1>

              <p className="mb-6 max-w-170 font-sans text-base leading-[1.55] text-text-muted">
                {description}
              </p>

              <div className="mb-5 flex flex-wrap items-center gap-2">
                <a
                  href={githubHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 font-mono text-[12px] text-text-muted no-underline transition-colors hover:border-line-strong hover:bg-surface-alt hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  aria-label="View project on GitHub"
                >
                  <BrandIcon name="github" size={14} />
                  <Star size={13} strokeWidth={1.4} />
                  {compactNumber(githubStars)}
                  <ExternalLink size={12} />
                </a>
                <Button
                  variant={liked ? 'brand' : 'monoOutline'}
                  size="meta"
                  onClick={() => void handleLike()}
                  disabled={likeMutation.isPending || !isSignedIn}
                  className="font-mono"
                  aria-label={liked ? 'Unlike project' : 'Like project'}
                >
                  <Heart
                    size={13}
                    fill={liked ? 'currentColor' : 'none'}
                    strokeWidth={1.6}
                  />
                  {compactNumber(locaticLikes)}
                </Button>
                <a
                  href="#project-discussion"
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 font-mono text-[12px] text-text-muted no-underline transition-colors hover:border-line-strong hover:bg-surface-alt hover:text-text"
                >
                  <MessageSquare size={13} strokeWidth={1.5} />
                  {detail.project.locatic.commentsCount}
                </a>
              </div>

              {detail.likedByPreview.length > 0 && (
                <div className="mb-5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-text-faint">
                  <span>liked by</span>
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
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-pill border border-line bg-surface px-2 py-1 text-text-muted"
                    >
                      <LxAvatar
                        name={user.displayName}
                        avatarUrl={user.avatarUrl}
                        size={16}
                      />
                      {user.displayName}
                    </button>
                  ))}
                </div>
              )}

              <div className="mb-5 flex flex-wrap items-center gap-2">
                {projectTopics.map((topic) => (
                  <span
                    key={topic}
                    className="inline-flex min-h-8 items-center gap-1 rounded-[3px] border border-line bg-surface px-2.5 py-1 font-mono text-[11.5px] text-text-muted"
                  >
                    #{topic}
                    {isOwnProject && (
                      <button
                        type="button"
                        onClick={() => void handleRemoveTopic(topic)}
                        disabled={pendingTopics}
                        className="-mr-1 inline-flex min-h-6 min-w-6 items-center justify-center rounded-sm bg-transparent text-text-faint transition-colors hover:text-text"
                        aria-label={`Remove ${topic}`}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </span>
                ))}
                {isOwnProject && (
                  <form
                    className="flex min-w-0 flex-wrap items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void handleAddTopic()
                    }}
                  >
                    <Input
                      value={topicDraft}
                      onChange={(event) => setTopicDraft(event.target.value)}
                      placeholder="add topic"
                      className="h-9 w-36 border-line bg-surface font-mono text-[12px]"
                    />
                    <Button
                      type="submit"
                      variant="monoOutline"
                      size="compact"
                      disabled={!topicDraft.trim() || pendingTopics}
                      className="font-mono"
                      aria-label="Add topic"
                    >
                      <Plus size={13} />
                      topic
                    </Button>
                  </form>
                )}
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
                  <div className="flex items-center gap-1.5">
                    <div className="font-mono text-sm font-semibold text-text">
                      {detail.owner.displayName}
                    </div>
                    {ownerGithubHref && (
                      <a
                        href={ownerGithubHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-text-faint no-underline transition-colors hover:text-text-muted"
                        aria-label="GitHub profile"
                      >
                        <BrandIcon name="github" size={13} />
                      </a>
                    )}
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

              {!isOwnProject && (
                <div className="mb-3.5 flex flex-wrap gap-2">
                  <Button
                    variant="monoOutline"
                    size="meta"
                    onClick={() => void openConversation(detail.owner.userId)}
                    disabled={
                      pendingUserId === String(detail.owner.userId) ||
                      !isSignedIn
                    }
                    className="font-mono"
                  >
                    {pendingUserId === String(detail.owner.userId)
                      ? 'opening...'
                      : 'message'}
                  </Button>
                  <Button
                    variant="monoOutline"
                    size="meta"
                    onClick={() => void handleFollow()}
                    disabled={followMutation.isPending || !isSignedIn}
                    className="font-mono"
                  >
                    {followMutation.isPending
                      ? 'working...'
                      : followed
                        ? 'following'
                        : 'follow'}
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap gap-2.5 font-mono text-[11.5px]">
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

          <Tabs defaultValue="posts" className="pb-12">
            <div className="mb-5 overflow-x-auto overflow-y-hidden border-b border-line">
              <TabsList className="h-auto min-w-max justify-start rounded-none bg-transparent p-0">
                {[
                  ['posts', `posts ${detail.project.locatic.postsCount ?? 0}`],
                  ['readme', 'README'],
                  ['updates', `updates ${detail.updates.length}`],
                  [
                    'discussion',
                    `discussion ${detail.project.locatic.commentsCount}`,
                  ],
                ].map(([value, label]) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="min-h-11 rounded-none border-b-2 border-transparent bg-transparent px-3.5 py-3 font-mono text-[12px] text-text-faint shadow-none data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:text-text data-[state=active]:shadow-none"
                  >
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="posts" className="mt-0">
              <ProjectPostsSection
                detail={detail}
                isOwnProject={isOwnProject}
                isSignedIn={Boolean(isSignedIn)}
                projectDetailQueryKey={projectDetailQueryKey}
                viewerId={viewer?.id ? String(viewer.id) : null}
              />
            </TabsContent>

            <TabsContent value="readme" className="mt-0">
              <div className="overflow-hidden rounded-[6px] border border-line bg-surface">
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
            </TabsContent>

            <TabsContent value="updates" className="mt-0">
              <div className="rounded-[6px] border border-line bg-surface p-4.5">
                {detail.updates.length === 0 ? (
                  <div className="font-sans text-[13px] text-text-muted">
                    no release updates yet.
                  </div>
                ) : (
                  detail.updates.map((update) => (
                    <div
                      key={String(update._id)}
                      className="border-b border-line py-4 last:border-b-0"
                    >
                      <div className="mb-1 font-mono text-xs font-semibold text-text">
                        {update.versionTag ? `${update.versionTag} · ` : ''}
                        {update.title}
                      </div>
                      <div className="font-sans text-[13px] leading-6 text-text-muted">
                        {update.description}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent
              id="project-discussion"
              value="discussion"
              className="mt-0"
            >
              <div>
                {isSignedIn && !commentComposerOpen ? (
                  <Button
                    variant="monoOutline"
                    size="meta"
                    onClick={() => setCommentComposerOpen(true)}
                    className="mb-4 font-mono"
                  >
                    <MessageSquare size={13} />
                    add project comment
                  </Button>
                ) : null}

                {isSignedIn && commentComposerOpen ? (
                  <div className="mb-4 flex flex-wrap gap-3 rounded-[6px] border border-line bg-surface px-3.5 py-3">
                    <Textarea
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder="say something thoughtful..."
                      rows={2}
                      className="min-h-18 flex-1 resize-none border-0 bg-transparent px-0 py-0 font-sans text-[13.5px] text-text shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    <div className="flex items-end gap-2">
                      <Button
                        variant="monoOutline"
                        size="meta"
                        onClick={() => {
                          setComment('')
                          setCommentComposerOpen(false)
                        }}
                        className="font-mono"
                      >
                        cancel
                      </Button>
                      <Button
                        variant="brand"
                        size="meta"
                        onClick={() => void handlePostComment()}
                        disabled={!comment.trim() || postingComment}
                        className="font-mono font-semibold"
                      >
                        {postingComment ? 'posting...' : 'post'}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {!isSignedIn ? (
                  <div className="mb-4 rounded-[6px] border border-line bg-surface px-3.5 py-3 font-mono text-[12.5px] text-text-faint">
                    <a href="/sign-in/$" className="text-brand no-underline">
                      sign in
                    </a>{' '}
                    to leave a comment.
                  </div>
                ) : null}

                {visibleRootComments.length === 0 &&
                commentRoots.status !== 'LoadingFirstPage' ? (
                  <div className="py-4 font-sans text-sm text-text-muted">
                    no project comments yet.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {visibleRootComments.map((commentItem) => (
                      <CommentThread
                        key={String(commentItem._id)}
                        activeHighlightedCommentId={activeHighlightedCommentId}
                        commentItem={commentItem}
                        commentLikeOverrides={commentLikeOverrides}
                        commentRefs={commentRefs}
                        depth={0}
                        expandedIds={expandedIds}
                        handleDeleteComment={handleDeleteComment}
                        handleReply={handleReply}
                        handleToggleCommentLike={handleToggleCommentLike}
                        isSignedIn={Boolean(isSignedIn)}
                        onToggleReplies={toggleCommentThread}
                        pendingCommentLikeId={pendingCommentLikeId}
                        pendingDeleteIds={pendingDeleteIds}
                        pendingReplies={pendingReplies}
                        replyDrafts={replyDrafts}
                        replyingToId={replyingToId}
                        setReplyDrafts={setReplyDrafts}
                        viewerId={viewer?.id ? String(viewer.id) : null}
                      />
                    ))}
                    {commentRoots.status === 'CanLoadMore' && (
                      <Button
                        variant="monoOutline"
                        size="meta"
                        onClick={() => commentRoots.loadMore(10)}
                        className="self-start font-mono"
                      >
                        load more comments
                      </Button>
                    )}
                    {commentRoots.status === 'LoadingMore' && (
                      <div className="font-mono text-[12px] text-text-faint">
                        loading more comments...
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
