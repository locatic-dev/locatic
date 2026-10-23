import { useAuth } from '@clerk/tanstack-react-start'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useConvexAuth, usePaginatedQuery } from 'convex/react'
import {
  Link,
  getRouteApi,
  useCanGoBack,
  useRouter,
} from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import {
  moreFromOwnerCityQueryOptions,
  projectDetailQueryOptions,
  projectSignalsQueryOptions,
} from '@/features/projects/queries'
import { LangDot } from '@/components/ui/lang-dot'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { BrandIcon } from '@/components/ui/brand-icon'
import { Button } from '@/components/ui/button'
import {
  ProjectCard,
  describeLatestUpdate,
  describeSyncFreshness,
} from '@/components/ui/project-card'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getActionErrorMessage, reportActionError } from '@/lib/action-error'
import { useSignInReturnHref } from '@/lib/return-href'
import { compactNumber } from '@/lib/format'
import { linkify } from '@/lib/linkify'
import { Bookmark, Star, ArrowLeft } from '@/lib/icons'
import {
  useAddComment,
  useDeleteComment,
  useUpdateProjectTopics,
} from '@/features/projects/mutations'
import { toProjectCardData } from '@/features/project-card-preview'
import {
  savedStateQueryOptions,
  useProjectSaveToggle,
} from '@/features/projects/saves'
import {
  mapViewerBootstrap,
  mapViewerSummary,
  type ProjectDetailPayload,
  type ViewerBootstrapPayload,
  type ViewerSummaryPayload,
} from '@/features/contracts'
import { shouldEnableViewerSummaryQuery } from '@/features/viewer/auth'
import {
  viewerQueryOptions,
  viewerSummaryQueryOptions,
} from '@/features/viewer/queries'
import { CommentThread } from '@/features/projects/comments/comment-thread'
import { commentComposerTextareaClass } from '@/features/projects/comments/composer-styles'
import { removeReplyDraft } from '@/features/projects/comments/drafts'
import { useCommentThreadState } from '@/features/projects/comments/use-comment-thread-state'
import { useCommentHighlight } from '@/features/projects/comments/use-comment-highlight'
import type { ProjectCommentView } from '@/features/projects/comments/types'
import { ProjectReadmeSection } from '@/features/projects/readme/project-readme-section'
import { ProjectReleasesSection } from '@/features/projects/releases/project-releases-section'
import { ProjectPostsSection } from '@/features/projects/posts/project-posts-section'
import { EmptyState } from '@/components/ui/empty-state'
import { cardSheetClass } from '@/components/ui/card-sheet'
import { ProjectReactionBar } from '@/features/projects/reactions/project-reaction-bar'
import { ProjectOwnerCard } from '@/features/projects/project-owner-card'
import { ProjectTopicEditor } from '@/features/projects/project-topic-editor'
import {
  buildProjectReturnHref,
  getCommentExpansionPath,
  getActiveHighlightedCommentId,
  getProjectDeepLinkTab,
  parseCommentPathSearch,
  PROJECT_TAB_ORDER,
  shouldAutoLoadDeepLinkPage,
  shouldResetReleasedHighlight,
  shouldSyncProjectTab,
  stripProjectCommentSearch,
  type ProjectTab,
} from '@/features/projects/deep-link'
import { CONTENT_LIMITS } from '../../../convex/lib/content_limits'

// Read search and navigation through the route API so this module does not
// import the route file that renders it.
const projectRouteApi = getRouteApi('/_app/project/$owner/$repo')

/**
 * Project detail view for a resolved project. The route renders it only when
 * `detail` is non-null, so every hook here runs on every render.
 */
export function ProjectView({
  detail,
  owner,
  repo,
}: {
  detail: ProjectDetailPayload
  owner: string
  repo: string
}) {
  const routeSearch = projectRouteApi.useSearch()
  const highlightedCommentId = routeSearch.comment ?? null
  const rawCommentPath =
    'commentPath' in routeSearch ? routeSearch.commentPath : undefined
  const highlightedCommentPath = useMemo(
    () => parseCommentPathSearch(rawCommentPath),
    [rawCommentPath],
  )
  const highlightedPostId =
    'post' in routeSearch ? (routeSearch.post ?? null) : null
  const highlightedReleaseId =
    'release' in routeSearch ? (routeSearch.release ?? null) : null
  const highlightedThreadId =
    'thread' in routeSearch ? (routeSearch.thread ?? null) : null
  // Sign-in returns to this project with its deep link (?comment, ?post,
  // ?release) and hash intact.
  const signInRedirect = useSignInReturnHref(
    buildProjectReturnHref({ owner, repo, search: routeSearch }),
  )
  const router = useRouter()
  const navigate = projectRouteApi.useNavigate()
  const canGoBack = useCanGoBack()
  const { isSignedIn } = useAuth()
  const convexAuth = useConvexAuth()
  const queryClient = useQueryClient()
  const addComment = useAddComment()
  const deleteComment = useDeleteComment()
  const updateProjectTopics = useUpdateProjectTopics()

  const viewerSummaryQuery = useQuery({
    ...viewerSummaryQueryOptions(),
    enabled: shouldEnableViewerSummaryQuery(convexAuth),
  })
  const viewer = mapViewerSummary(
    viewerSummaryQuery.data as ViewerSummaryPayload | undefined,
  )
  // Same signal `_app` uses to decide whether to render the app shell (and its
  // <main>); without the shell this view provides the landmark itself.
  const viewerBootstrapQuery = useQuery(viewerQueryOptions())
  const rendersInAppShell = Boolean(
    mapViewerBootstrap(
      viewerBootstrapQuery.data as ViewerBootstrapPayload | undefined,
    )?.viewer,
  )
  const RootElement = rendersInAppShell ? 'div' : 'main'
  const projectDetailQueryKey = projectDetailQueryOptions({
    owner,
    repo,
  }).queryKey
  const commentRoots = usePaginatedQuery(
    api.comments.listRootsByTarget,
    {
      targetId: String(detail.project._id),
      targetType: 'project',
      sort: 'newest',
    },
    { initialNumItems: 10 },
  )

  const [comment, setComment] = useState('')
  const [topicDraft, setTopicDraft] = useState('')
  const [pendingTopics, setPendingTopics] = useState(false)
  const [postingComment, setPostingComment] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [replyErrors, setReplyErrors] = useState<Record<string, string>>({})
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
  const {
    expand: expandCommentThread,
    expandedIds,
    toggle: toggleCommentThread,
  } = useCommentThreadState()
  const [pendingReplies, setPendingReplies] = useState<
    Record<string, ProjectCommentView[]>
  >({})

  const signalsQuery = useQuery(projectSignalsQueryOptions(detail.project._id))
  const signals = signalsQuery.data ?? null
  const moreFromCityQuery = useQuery(
    moreFromOwnerCityQueryOptions(detail.project._id),
  )
  const moreFromCity = moreFromCityQuery.data ?? null
  const saveToggle = useProjectSaveToggle()
  const savedStateQuery = useQuery(
    savedStateQueryOptions([detail.project._id], convexAuth.isAuthenticated),
  )
  // Unknown until the query answers; the toggle waits so it never inverts.
  const projectSaved = savedStateQuery.data
    ? savedStateQuery.data.length > 0
    : null

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
    releaseId: highlightedReleaseId,
    postsCount: detail.project.locatic.postsCount ?? 0,
  })
  const isOwnProject = viewer?.id === String(detail.owner.userId)
  const projectTopics =
    detail.project.locatic.tags.length > 0
      ? detail.project.locatic.tags
      : detail.project.github.topics
  const githubHref = `https://github.com/${detail.project.github.fullName}`
  // Until the signals load, the last push stands in for the latest update.
  const latestUpdate = signals
    ? signals.latestUpdate
    : detail.project.github.lastCommitAt > 0
      ? { kind: 'repo' as const, at: detail.project.github.lastCommitAt }
      : null
  const showSyncFreshness =
    signals !== null && signals.syncStatus.kind !== 'failed'
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
      reportActionError(error, {
        title: "couldn't save topics",
        retry: handleAddTopic,
      })
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
      reportActionError(error, {
        title: "couldn't remove the topic",
        retry: () => handleRemoveTopic(topic),
      })
    } finally {
      setPendingTopics(false)
    }
  }

  const handlePostComment = async () => {
    if (!comment.trim() || postingComment || !isSignedIn) {
      return
    }

    setPostingComment(true)
    setCommentError(null)

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
      setCommentError(getActionErrorMessage(error))
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
    setReplyErrors((current) => removeReplyDraft(current, parentKey))
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
      setReplyErrors((current) => ({
        ...current,
        [parentKey]: getActionErrorMessage(error),
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
      reportActionError(error, {
        title: "couldn't delete the comment",
        retry: () => handleDeleteComment(commentId),
      })
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
  const commentExpansionPath = useMemo(
    () =>
      getCommentExpansionPath({
        commentPath: highlightedCommentPath,
        threadId: highlightedThreadId,
      }),
    [highlightedCommentPath, highlightedThreadId],
  )
  const releaseCommentHighlight = useCallback(
    (target: string) => {
      setReleasedHighlightId(target)
      void navigate({
        replace: true,
        resetScroll: false,
        hash: '',
        search: stripProjectCommentSearch,
      })
    },
    [navigate],
  )
  const registerCommentElement = useCommentHighlight(
    activeHighlightedPostId ? null : activeHighlightedCommentId,
    releaseCommentHighlight,
  )

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
      highlightedCommentId ??
      highlightedPostId ??
      highlightedReleaseId ??
      hashCommentId ??
      hashPostId,
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
    highlightedReleaseId,
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

  const languages =
    detail.project.github.languages &&
    detail.project.github.languages.length > 0
      ? detail.project.github.languages
      : detail.project.github.primaryLanguage
        ? [{ name: detail.project.github.primaryLanguage, bytes: 0 }]
        : []

  return (
    <RootElement
      id={rendersInAppShell ? undefined : 'main-content'}
      tabIndex={rendersInAppShell ? undefined : -1}
      className="lx-page-shell flex flex-col bg-canvas"
    >
      <div className="shrink-0 border-b border-line bg-canvas px-(--lx-gutter) py-3">
        {/* In the detail column, the arrow pulled out by the button's
            padding so it lines up with the title below. */}
        <div className="lx-page-width-detail flex items-center">
          <Button
            variant="ghost"
            size="touch"
            className="-ml-3.5 pointer-coarse:-ml-4"
            onClick={() => {
              if (canGoBack) {
                router.history.back()
              } else {
                void router.navigate({ to: isSignedIn ? '/home' : '/' })
              }
            }}
            type="button"
          >
            <ArrowLeft size={14} /> back
          </Button>
        </div>
      </div>

      <div
        className="lx-page-scroll flex-1"
        data-scroll-restoration-id="project-detail"
      >
        <div className="lx-page-width-detail pt-2">
          <div className="mb-8 grid gap-6 border-b border-line pb-7 lg:grid-cols-[minmax(0,1.2fr)_320px] lg:items-start">
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex min-w-0 flex-col gap-2">
                <p className="m-0 text-eyebrow text-text-muted wrap-anywhere">
                  // {owner}
                </p>
                <h1 className="m-0 text-display text-text wrap-anywhere">
                  {repo}
                </h1>
              </div>

              {description && (
                <p className="m-0 max-w-170 text-body text-text-muted wrap-anywhere">
                  {linkify(description)}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={githubHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-2 rounded-control border border-line bg-surface px-3 py-2 font-mono text-label text-text-muted no-underline transition-colors hover:border-line-strong hover:bg-surface-alt hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:min-h-11"
                  aria-label="View project on GitHub"
                >
                  <BrandIcon name="github" size={14} />
                  <Star size={13} strokeWidth={1.4} />
                  {compactNumber(githubStars)}
                </a>
                {isSignedIn && !isOwnProject && (
                  <Button
                    size="touch"
                    onClick={() =>
                      void saveToggle.toggle({
                        projectId: detail.project._id,
                        projectName: detail.project.github.fullName,
                        saved: Boolean(projectSaved),
                      })
                    }
                    disabled={
                      projectSaved === null ||
                      saveToggle.isPending(detail.project._id)
                    }
                  >
                    <Bookmark
                      size={14}
                      strokeWidth={1.6}
                      fill={projectSaved ? 'currentColor' : 'none'}
                      aria-hidden="true"
                    />
                    {projectSaved ? 'saved' : 'save'}
                  </Button>
                )}
                {isSignedIn === false && (
                  <Button asChild size="touch">
                    <Link to="/sign-in/$" search={{ redirect: signInRedirect }}>
                      sign in to save
                    </Link>
                  </Button>
                )}
              </div>

              <ProjectReactionBar
                projectId={detail.project._id}
                reactionCounts={detail.reactionCounts}
                viewerReactionTypes={detail.viewerReactionTypes}
                liked={detail.viewerHasLiked}
                disabled={!isSignedIn}
              />

              <ProjectTopicEditor
                isOwnProject={isOwnProject}
                onAddTopic={handleAddTopic}
                onRemoveTopic={handleRemoveTopic}
                pending={pendingTopics}
                setTopicDraft={setTopicDraft}
                topicDraft={topicDraft}
                topics={projectTopics}
              />

              {languages.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-label text-text-muted">
                  {languages.map((language) => (
                    <LangDot
                      key={language.name}
                      lang={language.name}
                      showLabel
                    />
                  ))}
                </div>
              )}

              {(latestUpdate || showSyncFreshness) && (
                <p className="m-0 flex flex-wrap gap-x-2 gap-y-1 text-meta">
                  {latestUpdate && (
                    <span className="text-text-muted">
                      {describeLatestUpdate(latestUpdate)}
                    </span>
                  )}
                  {latestUpdate && showSyncFreshness && (
                    <span aria-hidden="true" className="text-text-muted">
                      ·
                    </span>
                  )}
                  {showSyncFreshness && (
                    <span className="text-text-muted">
                      {describeSyncFreshness(signals.syncStatus)}
                    </span>
                  )}
                </p>
              )}
            </div>

            <ProjectOwnerCard
              detail={detail}
              owner={owner}
              repo={repo}
              signals={signals}
              isOwnProject={isOwnProject}
              isSignedIn={isSignedIn}
              signInRedirect={signInRedirect}
            />
          </div>

          {readmePreview && (
            <div className="mb-8 max-w-[72ch]">
              <ProjectReadmeSection
                bases={readmeUrlBases}
                readmePreview={readmePreview}
              />
            </div>
          )}

          <div className="pb-[calc(var(--lx-mobile-tab-height)+3rem)] md:pb-12">
            <Tabs
              id="comments"
              value={activeProjectTab}
              onValueChange={(value) =>
                setActiveProjectTab(value as ProjectTab)
              }
              className="scroll-mt-4"
            >
              <div className="mb-5 overflow-x-auto overflow-y-hidden border-b border-line">
                <TabsList className="min-w-max">
                  {PROJECT_TAB_ORDER.map((value) => (
                    <TabsTrigger key={value} value={value}>
                      {value === 'comments'
                        ? `comments ${detail.project.locatic.commentsCount}`
                        : value === 'posts'
                          ? `posts ${detail.project.locatic.postsCount ?? 0}`
                          : `releases ${detail.releases.length}`}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              {/* Every panel stays mounted (hidden when inactive) so each tab's
                aria-controls resolves; only the active panel renders content. */}
              <TabsContent
                value="posts"
                forceMount
                hidden={activeProjectTab !== 'posts'}
              >
                {activeProjectTab === 'posts' && (
                  <ProjectPostsSection
                    detail={detail}
                    isOwnProject={isOwnProject}
                    isSignedIn={Boolean(isSignedIn)}
                    highlightedCommentId={
                      activeHighlightedPostId
                        ? activeHighlightedCommentId
                        : null
                    }
                    highlightedCommentPath={commentExpansionPath}
                    highlightedPostId={activeHighlightedPostId}
                    onReleaseCommentHighlight={releaseCommentHighlight}
                    projectDetailQueryKey={projectDetailQueryKey}
                    viewerId={viewer?.id ? String(viewer.id) : null}
                  />
                )}
              </TabsContent>

              <TabsContent
                value="releases"
                forceMount
                hidden={activeProjectTab !== 'releases'}
              >
                {activeProjectTab === 'releases' && (
                  <ProjectReleasesSection
                    releases={detail.releases}
                    highlightedReleaseId={highlightedReleaseId}
                  />
                )}
              </TabsContent>

              <TabsContent
                value="comments"
                forceMount
                hidden={activeProjectTab !== 'comments'}
              >
                {activeProjectTab === 'comments' && (
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
                            maxLength={CONTENT_LIMITS.comment}
                            value={comment}
                            onChange={(event) => setComment(event.target.value)}
                            placeholder="say something thoughtful…"
                            aria-label="Comment on this project"
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
                          {commentError && (
                            <p
                              role="alert"
                              className="m-0 basis-full font-mono text-label text-danger"
                            >
                              {commentError}
                            </p>
                          )}
                          <div className="mt-2 flex items-center justify-between gap-3">
                            <span className="hidden font-mono text-meta text-text-muted [@media(hover:hover)_and_(pointer:fine)]:inline">
                              Ctrl/⌘ + Enter to post
                            </span>
                            <Button
                              variant="primary"
                              size="meta"
                              onClick={() => void handlePostComment()}
                              disabled={!comment.trim() || postingComment}
                            >
                              {postingComment ? 'posting…' : 'post'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {!isSignedIn ? (
                      <div className="mb-4 rounded-card border border-line bg-surface px-3.5 py-3 font-mono text-label text-text-muted">
                        <Link
                          to="/sign-in/$"
                          search={{ redirect: signInRedirect }}
                          className="text-brand no-underline"
                        >
                          sign in
                        </Link>{' '}
                        to leave a comment.
                      </div>
                    ) : null}

                    {visibleRootComments.length === 0 &&
                    commentRoots.status !== 'LoadingFirstPage' ? (
                      <EmptyState
                        size="compact"
                        title="no project comments yet."
                      />
                    ) : (
                      <div className="flex flex-col gap-3">
                        {visibleRootComments.map((commentItem) => (
                          <CommentThread
                            key={String(commentItem._id)}
                            activeHighlightedCommentId={
                              activeHighlightedCommentId
                            }
                            commentItem={commentItem}
                            registerCommentElement={registerCommentElement}
                            highlightedCommentPath={commentExpansionPath}
                            depth={0}
                            expandedIds={expandedIds}
                            handleDeleteComment={handleDeleteComment}
                            handleReply={handleReply}
                            isSignedIn={Boolean(isSignedIn)}
                            onToggleReplies={toggleCommentThread}
                            pendingDeleteIds={pendingDeleteIds}
                            pendingReplies={pendingReplies}
                            replyDrafts={replyDrafts}
                            replyErrors={replyErrors}
                            replyingToId={replyingToId}
                            setReplyDrafts={setReplyDrafts}
                            viewerId={viewer?.id ? String(viewer.id) : null}
                          />
                        ))}
                        {commentRoots.status === 'CanLoadMore' && (
                          <div>
                            <Button
                              size="meta"
                              onClick={() => commentRoots.loadMore(10)}
                            >
                              load more comments
                            </Button>
                          </div>
                        )}
                        {commentRoots.status === 'LoadingMore' && (
                          <div className="font-mono text-label text-text-muted">
                            loading more comments…
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {moreFromCity && moreFromCity.projects.length > 0 && (
              <section
                aria-labelledby="more-from-city-heading"
                className="mt-10 border-t border-line pt-6"
              >
                <h2
                  id="more-from-city-heading"
                  className="m-0 mb-4 text-eyebrow text-text-muted wrap-anywhere"
                >
                  more from {moreFromCity.cityName}
                </h2>
                <div className={cardSheetClass}>
                  {moreFromCity.projects.map((preview) => (
                    <ProjectCard
                      key={String(preview.projectId)}
                      variant="row"
                      density="compact"
                      project={toProjectCardData(preview)}
                      authorLink={{ username: preview.authorHandle }}
                      projectLink={{ owner: preview.owner, repo: preview.repo }}
                      showActions={false}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </RootElement>
  )
}
