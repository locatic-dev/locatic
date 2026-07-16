import { useAuth } from '@clerk/tanstack-react-start'
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useConvexAuth, usePaginatedQuery } from 'convex/react'
import {
  createFileRoute,
  redirect,
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
import { linkify } from '@/lib/linkify'
import { Star, ArrowLeft, Plus, X } from '@/lib/icons'
import {
  useAddComment,
  useDeleteComment,
  useUpdateProjectTopics,
} from '@/features/projects/mutations'
import { useFollowUser, useUnfollowUser } from '@/features/follows/mutations'
import {
  mapProjectDetail,
  mapViewerSummary,
  type ProjectDetailPayload,
  type ViewerSummaryPayload,
} from '@/features/contracts'
import { socialLinkHref } from '@/lib/social-links'
import { useOpenConversation } from '@/features/inbox/use-open-conversation'
import { shouldEnableViewerSummaryQuery } from '@/features/viewer/auth'
import { viewerSummaryQueryOptions } from '@/features/viewer/queries'
import { CommentThread } from '@/features/projects/comments/comment-thread'
import { commentComposerTextareaClass } from '@/features/projects/comments/composer-styles'
import { removeReplyDraft } from '@/features/projects/comments/drafts'
import { useCommentThreadState } from '@/features/projects/comments/use-comment-thread-state'
import type { ProjectCommentView } from '@/features/projects/comments/types'
import { ProjectReadmeSection } from '@/features/projects/readme/project-readme-section'
import { ProjectReleasesSection } from '@/features/projects/releases/project-releases-section'
import { ProjectPostsSection } from '@/features/projects/posts/project-posts-section'
import { EmptyState } from '@/components/ui/empty-state'
import { ProjectReactionBar } from '@/features/projects/reactions/project-reaction-bar'
import {
  ProjectRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '@/components/app-shell/route-pending'
import {
  getCommentExpansionPath,
  getActiveHighlightedCommentId,
  getProjectDeepLinkTab,
  normalizeProjectSearchParam,
  parseCommentPathSearch,
  PROJECT_TAB_ORDER,
  shouldAutoLoadDeepLinkPage,
  shouldResetReleasedHighlight,
  shouldSyncProjectTab,
  stripProjectCommentSearch,
  type ProjectTab,
} from '@/features/projects/deep-link'

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
  validateSearch: (search: Record<string, unknown>) => {
    const comment = normalizeProjectSearchParam(search.comment)
    const commentPath = normalizeProjectSearchParam(search.commentPath)
    const post = normalizeProjectSearchParam(search.post)
    const thread = normalizeProjectSearchParam(search.thread)

    return {
      ...(comment ? { comment } : {}),
      ...(commentPath ? { commentPath } : {}),
      ...(post ? { post } : {}),
      ...(thread ? { thread } : {}),
    }
  },
  loader: async ({ context, location, params }) => {
    const payload = await context.queryClient.ensureQueryData(
      projectDetailQueryOptions({
        owner: params.owner,
        repo: params.repo,
      }),
    )

    const detail = payload as ProjectDetailPayload | null | undefined
    const canonicalRoute = detail?.canonicalRoute
    if (
      canonicalRoute &&
      (canonicalRoute.owner !== params.owner ||
        canonicalRoute.repo !== params.repo)
    ) {
      const search = location.search as {
        comment?: string | null
        commentPath?: string
        post?: string
        thread?: string
      }
      const comment = normalizeProjectSearchParam(search.comment)
      const commentPath = normalizeProjectSearchParam(search.commentPath)
      const post = normalizeProjectSearchParam(search.post)
      const thread = normalizeProjectSearchParam(search.thread)
      throw redirect({
        hash: location.hash,
        params: canonicalRoute,
        search: {
          ...(comment ? { comment } : {}),
          ...(commentPath ? { commentPath } : {}),
          ...(post ? { post } : {}),
          ...(thread ? { thread } : {}),
        },
        to: '/project/$owner/$repo',
      })
    }
  },
  pendingComponent: ProjectRoutePending,
  pendingMs: ROUTE_PENDING_MS,
  pendingMinMs: ROUTE_PENDING_MIN_MS,
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { owner, repo } = Route.useParams()
  const routeSearch = Route.useSearch()
  const highlightedCommentId = routeSearch.comment ?? null
  const highlightedCommentPath =
    'commentPath' in routeSearch
      ? parseCommentPathSearch(routeSearch.commentPath)
      : []
  const highlightedPostId =
    'post' in routeSearch ? (routeSearch.post ?? null) : null
  const highlightedThreadId =
    'thread' in routeSearch ? (routeSearch.thread ?? null) : null
  const router = useRouter()
  const navigate = Route.useNavigate()
  const canGoBack = useCanGoBack()
  const { isSignedIn } = useAuth()
  const convexAuth = useConvexAuth()
  const queryClient = useQueryClient()
  const addComment = useAddComment()
  const deleteComment = useDeleteComment()
  const updateProjectTopics = useUpdateProjectTopics()
  const followUser = useFollowUser()
  const unfollowUser = useUnfollowUser()
  const { openConversation, pendingUserId } = useOpenConversation()

  const projectRoute = { owner, repo }
  const { data } = useSuspenseQuery(projectDetailQueryOptions(projectRoute))
  const viewerSummaryQuery = useQuery({
    ...viewerSummaryQueryOptions(),
    enabled: shouldEnableViewerSummaryQuery(convexAuth),
  })
  const viewer = mapViewerSummary(
    viewerSummaryQuery.data as ViewerSummaryPayload | undefined,
  )
  const detail = mapProjectDetail(
    data as ProjectDetailPayload | null | undefined,
  )
  const projectDetailQueryKey = projectDetailQueryOptions(projectRoute).queryKey
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
  const [postingComment, setPostingComment] = useState(false)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(
    new Set(),
  )
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [hashCommentId, setHashCommentId] = useState<string | null>(null)
  const [hashPostId, setHashPostId] = useState<string | null>(null)
  // Once a deep-linked comment has flashed, it is "released" to a normal,
  // fully-interactive comment so toggling replies no longer fights the user.
  const [releasedHighlightId, setReleasedHighlightId] = useState<string | null>(
    null,
  )
  const [activeProjectTab, setActiveProjectTab] =
    useState<ProjectTab>('comments')
  const projectCommentLoadAttemptsRef = useRef(0)
  const projectCommentLoadTargetRef = useRef<string | null>(null)
  const didSyncInitialProjectTabRef = useRef(false)
  const commentRefs = useRef<Record<string, HTMLElement | null>>({})
  const scrolledHighlightRef = useRef<string | null>(null)
  const {
    expand: expandCommentThread,
    expandedIds,
    toggle: toggleCommentThread,
  } = useCommentThreadState()
  const [pendingReplies, setPendingReplies] = useState<
    Record<string, ProjectCommentView[]>
  >({})

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

  const followed = detail.viewerFollowsOwner
  const githubStars = detail.project.github.stargazersCount
  const comments = (commentRoots.results ?? []) as ProjectCommentView[]
  const visibleRootComments = comments.filter(
    (commentItem) => !commentItem.isDeleted || commentItem.replyCount > 0,
  )
  const description = detail.project.github.description?.trim() ?? ''
  const storedReadmePreview = detail.project.github.readmePreview?.trim() ?? ''
  const readmePreview = storedReadmePreview
  const readmeUrlBases = {
    readmeAssetBaseUrl: detail.project.github.readmeAssetBaseUrl,
    readmeAssetRootUrl: detail.project.github.readmeAssetRootUrl,
    readmeLinkBaseUrl: detail.project.github.readmeLinkBaseUrl,
    readmeLinkRootUrl: detail.project.github.readmeLinkRootUrl,
  }
  const defaultProjectTab = getProjectDeepLinkTab({
    commentId: highlightedCommentId,
    postId: highlightedPostId,
    postsCount: detail.project.locatic.postsCount ?? 0,
  })
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
      reactionCounts: {},
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
      viewerReactionTypes: [],
    }
    setPendingReplies((current) => ({
      ...current,
      [parentKey]: [...(current[parentKey] ?? []), pendingReply],
    }))
    setReplyDrafts((current) => removeReplyDraft(current, parentKey))

    try {
      await addComment({
        content: draft,
        parentId,
        targetId: String(detail.project._id),
        targetType: 'project',
      })
      await queryClient.invalidateQueries({
        queryKey: projectDetailQueryKey,
      })
    } catch (error) {
      console.error(error)
      setReplyDrafts((current) => ({
        ...current,
        [parentKey]: draft,
      }))
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
      setHashPostId(hash.startsWith('post-') ? hash.slice(5) : null)
    }

    syncHashComment()
    window.addEventListener('hashchange', syncHashComment)

    return () => window.removeEventListener('hashchange', syncHashComment)
  }, [])

  const rawHighlightedCommentId = highlightedCommentId ?? hashCommentId
  const activeHighlightedCommentId = getActiveHighlightedCommentId({
    rawHighlightedCommentId,
    releasedHighlightId,
  })
  const activeHighlightedPostId = highlightedPostId ?? hashPostId
  const commentExpansionPath = getCommentExpansionPath({
    commentPath: highlightedCommentPath,
    threadId: highlightedThreadId,
  })

  useEffect(() => {
    if (
      shouldResetReleasedHighlight({
        rawHighlightedCommentId,
        releasedHighlightId,
      })
    ) {
      setReleasedHighlightId(null)
    }
  }, [rawHighlightedCommentId, releasedHighlightId])

  useEffect(() => {
    const hasActiveDeepLinkTarget = Boolean(
      highlightedCommentId ?? highlightedPostId ?? hashCommentId ?? hashPostId,
    )
    if (
      shouldSyncProjectTab({
        hasActiveDeepLinkTarget,
        hasSyncedInitialTab: didSyncInitialProjectTabRef.current,
      })
    ) {
      setActiveProjectTab(defaultProjectTab)
      didSyncInitialProjectTabRef.current = true
    }
  }, [
    defaultProjectTab,
    hashCommentId,
    hashPostId,
    highlightedCommentId,
    highlightedPostId,
  ])

  useEffect(() => {
    if (activeHighlightedPostId) {
      return
    }

    for (const commentId of commentExpansionPath) {
      expandCommentThread(commentId)
    }
  }, [activeHighlightedPostId, commentExpansionPath, expandCommentThread])

  useEffect(() => {
    const highlightedRootCommentId =
      commentExpansionPath[0] ?? activeHighlightedCommentId
    if (activeHighlightedPostId || !highlightedRootCommentId) {
      return
    }
    if (projectCommentLoadTargetRef.current !== highlightedRootCommentId) {
      projectCommentLoadTargetRef.current = highlightedRootCommentId
      projectCommentLoadAttemptsRef.current = 0
    }

    const rootIsLoaded = comments.some(
      (commentItem) => String(commentItem._id) === highlightedRootCommentId,
    )
    if (
      shouldAutoLoadDeepLinkPage({
        attempts: projectCommentLoadAttemptsRef.current,
        isLoaded: rootIsLoaded,
        status: commentRoots.status,
        targetId: highlightedRootCommentId,
      })
    ) {
      projectCommentLoadAttemptsRef.current += 1
      commentRoots.loadMore(10)
    }
  }, [
    activeHighlightedCommentId,
    activeHighlightedPostId,
    commentExpansionPath,
    commentRoots,
    comments,
  ])

  // Scroll the highlighted comment into view ONCE. Keeping comments.length in
  // deps lets us retry until the element mounts, but the ref guard ensures we
  // do not re-center on every reply expand/collapse.
  useEffect(() => {
    if (!activeHighlightedCommentId) {
      return
    }
    if (scrolledHighlightRef.current === activeHighlightedCommentId) {
      return
    }

    const commentElement = commentRefs.current[activeHighlightedCommentId]
    if (!commentElement) {
      return
    }

    scrolledHighlightRef.current = activeHighlightedCommentId
    commentElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [activeHighlightedCommentId, comments.length])

  // Flash the highlight briefly, then release it and strip the deep-link params
  // so a refresh does not re-highlight and the comment becomes fully normal.
  useEffect(() => {
    if (!activeHighlightedCommentId) {
      return
    }

    const target = activeHighlightedCommentId
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(
      () => {
        setReleasedHighlightId(target)
        void navigate({
          replace: true,
          hash: '',
          search: stripProjectCommentSearch,
        })
      },
      prefersReducedMotion ? 0 : 1800,
    )

    return () => window.clearTimeout(timer)
  }, [activeHighlightedCommentId, navigate])

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

      <div
        className="lx-page-scroll flex-1"
        data-scroll-restoration-id="project-detail"
      >
        <div className="lx-page-width-detail pt-2">
          <div className="mb-8 grid gap-6 border-b border-line pb-7 lg:grid-cols-[minmax(0,1.2fr)_320px] lg:items-start">
            <div>
              <h1 className="mb-3 font-mono text-[clamp(30px,4vw,42px)] font-bold tracking-tight text-text wrap-anywhere">
                {repo}
              </h1>

              {description && (
                <p className="mb-6 max-w-170 font-sans text-base leading-[1.55] text-text-muted wrap-anywhere">
                  {linkify(description)}
                </p>
              )}

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
                </a>
              </div>

              <ProjectReactionBar
                projectId={String(detail.project._id)}
                reactionCounts={detail.reactionCounts}
                viewerReactionTypes={detail.viewerReactionTypes}
                liked={detail.viewerHasLiked}
                disabled={!isSignedIn}
              />

              <div className="mb-5 flex flex-wrap items-center gap-2">
                {projectTopics.map((topic) => (
                  <span
                    key={topic}
                    className="inline-flex min-h-7 items-center gap-1 rounded-pill border border-brand/30 bg-brand-quiet px-2.5 py-1 font-mono text-[11px] text-brand"
                  >
                    #{topic}
                    {isOwnProject && (
                      <button
                        type="button"
                        onClick={() => void handleRemoveTopic(topic)}
                        disabled={pendingTopics}
                        className="-my-2 -mr-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-transparent text-brand transition-colors hover:text-text"
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

              <div className="flex flex-wrap items-center gap-2">
                {languages.map((language) => (
                  <LangDot
                    key={language.name}
                    lang={language.name}
                    variant="chip"
                  />
                ))}
                <span className="font-mono text-[11px] text-text-faint">
                  updated {relativeTime(detail.project.github.lastCommitAt)}
                </span>
              </div>
            </div>

            <div className="rounded-[6px] border border-line bg-surface p-4.5">
              <div className="mb-3.5 flex w-full items-center gap-2">
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
                  className="group flex min-w-0 flex-1 items-center gap-3 border-0 bg-transparent p-0 text-left"
                >
                  <LxAvatar
                    name={detail.owner.displayName}
                    avatarUrl={detail.owner.avatarUrl}
                    size={48}
                    className="ring-1 ring-transparent ring-offset-2 ring-offset-surface transition-[box-shadow] group-hover:ring-brand/40"
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
                {ownerGithubHref && (
                  <a
                    href={ownerGithubHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-text-muted no-underline transition-colors hover:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    aria-label="GitHub profile"
                  >
                    <BrandIcon name="github" size={13} />
                  </a>
                )}
              </div>

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

          {readmePreview && (
            <div className="mb-8">
              <ProjectReadmeSection
                bases={readmeUrlBases}
                readmePreview={readmePreview}
              />
            </div>
          )}

          <Tabs
            value={activeProjectTab}
            onValueChange={(value) => setActiveProjectTab(value as ProjectTab)}
            className="pb-[calc(var(--lx-mobile-tab-height)+3rem)] md:pb-12"
          >
            <div className="mb-5 overflow-x-auto overflow-y-hidden border-b border-line">
              <TabsList className="h-auto min-w-max justify-start rounded-none bg-transparent p-0">
                {PROJECT_TAB_ORDER.map((value) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="min-h-11 rounded-none border-b-2 border-transparent bg-transparent px-3.5 py-3 font-mono text-[12px] text-text-muted shadow-none data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:text-text data-[state=active]:shadow-none"
                  >
                    {value === 'comments'
                      ? `comments ${detail.project.locatic.commentsCount}`
                      : value === 'posts'
                        ? `posts ${detail.project.locatic.postsCount ?? 0}`
                        : `releases ${detail.releases.length}`}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="posts" className="mt-0">
              <ProjectPostsSection
                detail={detail}
                isOwnProject={isOwnProject}
                isSignedIn={Boolean(isSignedIn)}
                highlightedCommentId={
                  activeHighlightedPostId ? activeHighlightedCommentId : null
                }
                highlightedCommentPath={commentExpansionPath}
                highlightedPostId={activeHighlightedPostId}
                projectDetailQueryKey={projectDetailQueryKey}
                viewerId={viewer?.id ? String(viewer.id) : null}
              />
            </TabsContent>

            <TabsContent value="releases" className="mt-0">
              <ProjectReleasesSection releases={detail.releases} />
            </TabsContent>

            <TabsContent
              id="project-comments"
              value="comments"
              className="mt-0"
            >
              <div>
                {isSignedIn ? (
                  <div className="mb-5 flex items-start gap-3 rounded-card border border-line bg-surface px-4 py-4">
                    <LxAvatar
                      name={viewer?.displayName ?? 'You'}
                      avatarUrl={viewer?.avatarUrl}
                      size={36}
                    />
                    <div className="min-w-0 flex-1">
                      <Textarea
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        placeholder="say something thoughtful..."
                        rows={3}
                        className={commentComposerTextareaClass}
                        onKeyDown={(event) => {
                          if (
                            (event.metaKey || event.ctrlKey) &&
                            event.key === 'Enter' &&
                            comment.trim() &&
                            !postingComment
                          ) {
                            event.preventDefault()
                            void handlePostComment()
                          }
                        }}
                      />
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="font-mono text-[10.5px] text-text-faint">
                          Ctrl/⌘ + Enter to post
                        </span>
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
                  </div>
                ) : null}

                {!isSignedIn ? (
                  <div className="mb-4 rounded-[6px] border border-line bg-surface px-3.5 py-3 font-mono text-[12.5px] text-text-muted">
                    <a href="/sign-in/$" className="text-brand no-underline">
                      sign in
                    </a>{' '}
                    to leave a comment.
                  </div>
                ) : null}

                {visibleRootComments.length === 0 &&
                commentRoots.status !== 'LoadingFirstPage' ? (
                  <EmptyState size="compact" title="no project comments yet." />
                ) : (
                  <div className="flex flex-col gap-3">
                    {visibleRootComments.map((commentItem) => (
                      <CommentThread
                        key={String(commentItem._id)}
                        activeHighlightedCommentId={activeHighlightedCommentId}
                        commentItem={commentItem}
                        commentRefs={commentRefs}
                        depth={0}
                        expandedIds={expandedIds}
                        handleDeleteComment={handleDeleteComment}
                        handleReply={handleReply}
                        isSignedIn={Boolean(isSignedIn)}
                        onToggleReplies={toggleCommentThread}
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
                      <div className="font-mono text-[12px] text-text-muted">
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
