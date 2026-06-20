import { createFileRoute } from '@tanstack/react-router'
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useClerk } from '@clerk/tanstack-react-start'
import { useEffect, useState, useTransition } from 'react'
import { useAction } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import {
  privateFollowGraphQueryOptions,
  privateProfileCommentsQueryOptions,
  privateProfileContributionsQueryOptions,
  privateProfileLikedProjectsQueryOptions,
  privateProfileOverviewQueryOptions,
  privateProfilePostsQueryOptions,
  privateProfileProjectsQueryOptions,
} from '@/features/profile/queries'
import {
  normalizeProfileSearch,
  type ProfileContentTab,
  type ProfileNetworkTab,
} from '@/features/profile/state'
import { ProfileContentTabs } from '@/features/profile/content-tabs'
import {
  commentAvailabilityCopy,
  getProfileCommentDestination,
  isCommentTargetOpenable,
} from '@/features/profile/comment-navigation'
import { ProfileMobileAccountActions } from '@/features/profile/mobile-account-actions'
import { ProfileNetworkSection } from '@/features/profile/network-section'
import { ProfilePostList } from '@/features/profile/post-list'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { StatusPill } from '@/components/ui/status-pill'
import { BrandIcon } from '@/components/ui/brand-icon'
import { ContributionGraph } from '@/components/ui/contribution-graph'
import { Button } from '@/components/ui/button'
import { compactNumber } from '@/lib/format'
import { relativeTime } from '@/lib/time'
import { ProjectCard } from '@/components/ui/project-card'
import {
  FormRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '@/components/app-shell/route-pending'
import { usePinOwnedProject } from '@/features/projects/mutations'
import { RepositoryManagerDialog } from '@/features/github/repository-manager-dialog'
import {
  mapPrivateProfileOverview,
  type ContributedProjectPreview,
  type ProjectCardPreview,
  type ProfileCommentPreview,
  type ProfilePostPreview,
  type PrivateProfileOverviewPayload,
  type ProfileSocialPagePayload,
} from '@/features/contracts'
import {
  getProjectCardDbId,
  getProjectCardId,
  getProjectCardOwner,
  getProjectCardRepo,
  toProjectCardData,
} from '@/features/project-card-preview'
import { socialLinkHref } from '@/lib/social-links'
import { Pin } from '@/lib/icons'
import { shouldPrefetchPrivateConvexQueries } from '@/lib/auth-routing'

const TAB_QUERY_STALE_TIME = 60_000
const SOCIAL_PAGE_SIZE = 12

export const Route = createFileRoute('/_app/profile')({
  validateSearch: normalizeProfileSearch,
  loaderDeps: ({ search }) => ({
    network: search.network ?? 'followers',
  }),
  loader: async ({ context, deps }) => {
    if (!shouldPrefetchPrivateConvexQueries()) {
      return
    }

    const overview = await context.queryClient.ensureQueryData(
      privateProfileOverviewQueryOptions(),
    )

    await context.queryClient.ensureQueryData(
      privateFollowGraphQueryOptions({
        kind: deps.network,
        paginationOpts: {
          cursor: null,
          numItems: SOCIAL_PAGE_SIZE,
        },
      }),
    )

    return overview
  },
  pendingComponent: FormRoutePending,
  pendingMs: ROUTE_PENDING_MS,
  pendingMinMs: ROUTE_PENDING_MIN_MS,
  component: ProfilePage,
})

function mergeSocialItems<
  TItem extends {
    userId: Id<'users'>
  },
>(current: TItem[], nextItems: TItem[]) {
  const itemsById = new Map(current.map((item) => [String(item.userId), item]))

  for (const item of nextItems) {
    itemsById.set(String(item.userId), item)
  }

  return [...itemsById.values()]
}

function emptySocialPage(): ProfileSocialPagePayload {
  return {
    continueCursor: '',
    isDone: true,
    page: [],
    pageStatus: null,
    splitCursor: null,
  }
}

function resolveVisibleSocialPage(
  statePage: ProfileSocialPagePayload,
  queriedPage: ProfileSocialPagePayload | undefined,
) {
  if (!queriedPage) {
    return statePage
  }

  const stateHasLoadedPage =
    statePage.page.length > 0 ||
    statePage.continueCursor !== '' ||
    !statePage.isDone

  return stateHasLoadedPage ? statePage : queriedPage
}

function ProfilePage() {
  const { tab, network = 'followers' } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { signOut } = useClerk()
  const queryClient = useQueryClient()
  const [isRoutePending, startRouteTransition] = useTransition()
  const { data } = useSuspenseQuery(privateProfileOverviewQueryOptions())
  const overview = mapPrivateProfileOverview(
    data as PrivateProfileOverviewPayload | undefined,
  )

  if (!overview) {
    throw new Error('Profile data was not available')
  }

  const syncContributions = useAction(api.github_actions.syncContributions)
  const pinOwnedProject = usePinOwnedProject()
  const [isSyncing, setIsSyncing] = useState(false)
  const [pinPendingId, setPinPendingId] = useState<string | null>(null)
  const [loadingMoreGraph, setLoadingMoreGraph] =
    useState<ProfileNetworkTab | null>(null)
  const [followersPage, setFollowersPage] =
    useState<ProfileSocialPagePayload>(emptySocialPage)
  const [followingPage, setFollowingPage] =
    useState<ProfileSocialPagePayload>(emptySocialPage)
  const activeSocialQuery = useQuery({
    ...privateFollowGraphQueryOptions({
      kind: network,
      paginationOpts: {
        cursor: null,
        numItems: SOCIAL_PAGE_SIZE,
      },
    }),
    staleTime: TAB_QUERY_STALE_TIME,
  })
  const activeSocialPage = activeSocialQuery.data as
    | ProfileSocialPagePayload
    | undefined

  const projectsQuery = useQuery({
    ...privateProfileProjectsQueryOptions(),
    enabled: tab === 'projects',
    staleTime: TAB_QUERY_STALE_TIME,
  })
  const postsQuery = useQuery({
    ...privateProfilePostsQueryOptions(),
    enabled: tab === 'posts',
    staleTime: TAB_QUERY_STALE_TIME,
  })
  const contributionsQuery = useQuery({
    ...privateProfileContributionsQueryOptions(),
    enabled: tab === 'contributions',
    staleTime: TAB_QUERY_STALE_TIME,
  })
  const commentsQuery = useQuery({
    ...privateProfileCommentsQueryOptions(),
    enabled: tab === 'comments',
    staleTime: TAB_QUERY_STALE_TIME,
  })
  const likedProjectsQuery = useQuery({
    ...privateProfileLikedProjectsQueryOptions(),
    enabled: tab === 'liked',
    staleTime: TAB_QUERY_STALE_TIME,
  })

  useEffect(() => {
    if (!activeSocialPage) {
      return
    }

    if (network === 'followers') {
      setFollowersPage(activeSocialPage)
      return
    }

    setFollowingPage(activeSocialPage)
  }, [activeSocialPage, network])

  useEffect(() => {
    void queryClient.prefetchQuery(privateProfileProjectsQueryOptions())
    void queryClient.prefetchQuery(privateProfilePostsQueryOptions())
    void queryClient.prefetchQuery(privateProfileContributionsQueryOptions())
    void queryClient.prefetchQuery(privateProfileCommentsQueryOptions())
    void queryClient.prefetchQuery(privateProfileLikedProjectsQueryOptions())
    void queryClient.prefetchQuery(
      privateFollowGraphQueryOptions({
        kind: 'followers',
        paginationOpts: {
          cursor: null,
          numItems: SOCIAL_PAGE_SIZE,
        },
      }),
    )
    void queryClient.prefetchQuery(
      privateFollowGraphQueryOptions({
        kind: 'following',
        paginationOpts: {
          cursor: null,
          numItems: SOCIAL_PAGE_SIZE,
        },
      }),
    )
  }, [queryClient])

  useEffect(() => {
    const syncedAt = overview.viewer.githubContributions?.syncedAt
    const isStale = !syncedAt || Date.now() - syncedAt > 6 * 60 * 60 * 1000
    if (!isStale) {
      return
    }

    setIsSyncing(true)
    void syncContributions({})
      .then(() =>
        Promise.all([
          queryClient.invalidateQueries({
            queryKey: privateProfileOverviewQueryOptions().queryKey,
          }),
          queryClient.invalidateQueries({
            queryKey: privateProfileContributionsQueryOptions().queryKey,
          }),
        ]),
      )
      .catch(console.error)
      .finally(() => setIsSyncing(false))
  }, [
    overview.viewer.githubContributions?.syncedAt,
    queryClient,
    syncContributions,
  ])

  const githubHref = socialLinkHref('github', overview.viewer.githubUsername)
  const xHref = socialLinkHref('x', overview.viewer.socialLinks.x)
  const linkedinHref = socialLinkHref(
    'linkedin',
    overview.viewer.socialLinks.linkedin,
  )
  const blueskyHref = socialLinkHref(
    'bluesky',
    overview.viewer.socialLinks.bluesky,
  )
  const websiteHref = socialLinkHref(
    'website',
    overview.viewer.socialLinks.website,
  )
  const tabs = [
    {
      id: 'projects',
      label: 'projects',
      mobileLabel: 'projects',
      count: overview.viewer.stats.projectsCount,
    },
    {
      id: 'posts',
      label: 'posts',
      mobileLabel: 'posts',
      count: overview.viewer.stats.postsCount ?? 0,
    },
    {
      id: 'contributions',
      label: 'contributions',
      mobileLabel: 'contrib',
      count: overview.viewer.stats.contributionsCount,
    },
    {
      id: 'comments',
      label: 'comments',
      mobileLabel: 'comments',
      count: overview.viewer.stats.commentsCount,
    },
    {
      id: 'liked',
      label: 'liked',
      mobileLabel: 'liked',
      count: overview.viewer.stats.likedCount,
    },
  ] as const

  const projects =
    (projectsQuery.data as Array<ProjectCardPreview> | undefined) ?? []
  const posts = (postsQuery.data as Array<ProfilePostPreview> | undefined) ?? []
  const contributions =
    (contributionsQuery.data as Array<ContributedProjectPreview> | undefined) ??
    []
  const comments =
    (commentsQuery.data as Array<ProfileCommentPreview> | undefined) ?? []
  const likedProjects =
    (likedProjectsQuery.data as
      | Array<{
          reactionId: Id<'reactions'>
          projectId: Id<'projects'>
          likedAt: number
          project: ProjectCardPreview
        }>
      | undefined) ?? []

  const contentIsLoading =
    (tab === 'projects' && projectsQuery.isLoading) ||
    (tab === 'posts' && postsQuery.isLoading) ||
    (tab === 'contributions' && contributionsQuery.isLoading) ||
    (tab === 'comments' && commentsQuery.isLoading) ||
    (tab === 'liked' && likedProjectsQuery.isLoading)

  const pinnedProjectIds = new Set(
    overview.viewer.pinnedProfileProjectIds.map(String),
  )
  const socialItems =
    network === 'followers'
      ? resolveVisibleSocialPage(followersPage, activeSocialPage).page
      : resolveVisibleSocialPage(followingPage, activeSocialPage).page
  const hasMoreSocial =
    network === 'followers'
      ? !resolveVisibleSocialPage(followersPage, activeSocialPage).isDone
      : !resolveVisibleSocialPage(followingPage, activeSocialPage).isDone

  const prefetchTab = (nextTab: ProfileContentTab) => {
    switch (nextTab) {
      case 'projects':
        return queryClient.prefetchQuery(privateProfileProjectsQueryOptions())
      case 'posts':
        return queryClient.prefetchQuery(privateProfilePostsQueryOptions())
      case 'contributions':
        return queryClient.prefetchQuery(
          privateProfileContributionsQueryOptions(),
        )
      case 'comments':
        return queryClient.prefetchQuery(privateProfileCommentsQueryOptions())
      case 'liked':
        return queryClient.prefetchQuery(
          privateProfileLikedProjectsQueryOptions(),
        )
    }
  }

  const navigateSearch = (
    nextValues: Partial<{
      tab: ProfileContentTab
      network: ProfileNetworkTab
    }>,
  ) => {
    startRouteTransition(() => {
      void navigate({
        to: '/profile',
        search: (current) => ({ ...current, ...nextValues }),
        resetScroll: false,
      })
    })
  }

  const handleTogglePin = async (
    projectId: Id<'projects'>,
    projectKey: string,
    pinned: boolean,
  ) => {
    if (pinPendingId === projectKey) {
      return
    }

    setPinPendingId(projectKey)
    try {
      await pinOwnedProject({
        pinned: !pinned,
        projectId,
      })
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: privateProfileOverviewQueryOptions().queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: privateProfileProjectsQueryOptions().queryKey,
        }),
      ])
    } catch (error) {
      console.error(error)
    } finally {
      setPinPendingId(null)
    }
  }

  const openCommentTarget = (comment: ProfileCommentPreview) => {
    const destination = getProfileCommentDestination(comment)
    if (!destination) {
      return
    }

    void navigate(destination)
  }

  const handleLoadMoreGraph = async (kind: ProfileNetworkTab) => {
    if (loadingMoreGraph === kind) {
      return
    }

    const statePage = kind === 'followers' ? followersPage : followingPage
    const currentPage = resolveVisibleSocialPage(
      statePage,
      kind === network ? activeSocialPage : undefined,
    )
    if (currentPage.isDone) {
      return
    }

    setLoadingMoreGraph(kind)

    try {
      const page = (await queryClient.fetchQuery(
        privateFollowGraphQueryOptions({
          kind,
          paginationOpts: {
            cursor: currentPage.continueCursor,
            numItems: SOCIAL_PAGE_SIZE,
          },
        }),
      )) as ProfileSocialPagePayload

      if (kind === 'followers') {
        setFollowersPage((current) => ({
          ...page,
          page: mergeSocialItems(current.page, page.page),
        }))
      } else {
        setFollowingPage((current) => ({
          ...page,
          page: mergeSocialItems(current.page, page.page),
        }))
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingMoreGraph(null)
    }
  }

  const networkIsLoading =
    activeSocialQuery.isLoading && activeSocialQuery.data === undefined

  return (
    <div className="lx-page-shell">
      <div className="lx-page-scroll flex-1">
        <div className="lx-page-width-profile">
          <div className="relative border-b border-line py-8 pb-7">
            <div className="flex flex-col items-start gap-6">
              <LxAvatar
                name={overview.viewer.displayName}
                avatarUrl={overview.viewer.avatarUrl}
                size={88}
              />
              <div className="flex w-full flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex-1 pt-1">
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <h1 className="m-0 font-mono text-[30px] font-bold tracking-[-0.02em] text-text">
                      {overview.viewer.displayName}
                    </h1>
                    <StatusPill
                      status={overview.viewer.buildStatus}
                      size="md"
                    />
                  </div>
                  <div className="mb-3.5 font-mono text-[13px] text-text-faint">
                    <span>@{overview.viewer.githubUsername}</span>
                    {overview.viewer.cityName && (
                      <span> · {overview.viewer.cityName}</span>
                    )}
                  </div>
                  {overview.viewer.bio && (
                    <p className="mb-4 max-w-135 font-sans text-sm leading-6 text-text-muted">
                      {overview.viewer.bio}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-4.5 font-mono text-xs">
                    <button
                      type="button"
                      onClick={() => navigateSearch({ network: 'followers' })}
                      className="bg-transparent p-0 text-left font-mono text-xs text-inherit"
                    >
                      <strong className="text-text">
                        {compactNumber(overview.viewer.stats.followersCount)}
                      </strong>{' '}
                      <span className="text-text-faint">followers</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateSearch({ network: 'following' })}
                      className="bg-transparent p-0 text-left font-mono text-xs text-inherit"
                    >
                      <strong className="text-text">
                        {compactNumber(overview.viewer.stats.followingCount)}
                      </strong>{' '}
                      <span className="text-text-faint">following</span>
                    </button>
                    <span className="ml-1.5 inline-flex items-center gap-2.5 text-text-faint">
                      {githubHref && (
                        <a
                          href={githubHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-inherit"
                        >
                          <BrandIcon name="github" size={14} />
                        </a>
                      )}
                      {xHref && (
                        <a
                          href={xHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-inherit"
                        >
                          <BrandIcon name="twitter" size={14} />
                        </a>
                      )}
                      {linkedinHref && (
                        <a
                          href={linkedinHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-inherit"
                        >
                          <BrandIcon name="linkedin" size={14} />
                        </a>
                      )}
                      {blueskyHref && (
                        <a
                          href={blueskyHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-inherit no-underline"
                        >
                          bsky
                        </a>
                      )}
                      {websiteHref && (
                        <a
                          href={websiteHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-inherit no-underline"
                        >
                          site
                        </a>
                      )}
                    </span>
                  </div>
                </div>
                <Button
                  variant="monoOutline"
                  size="meta"
                  onClick={() =>
                    void navigate({
                      to: '/settings',
                      search: { tab: 'account' },
                    })
                  }
                  className="shrink-0 font-mono"
                >
                  edit profile
                </Button>
              </div>
              <ProfileMobileAccountActions
                onSignOut={() => void signOut({ redirectUrl: '/' })}
              />
            </div>

            <div className="mt-7">
              <div className="mb-2.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-faint">
                {overview.viewer.githubContributions?.totalContributions != null
                  ? `${overview.viewer.githubContributions.totalContributions.toLocaleString()} contributions this year`
                  : 'contributions this year'}
              </div>
              <div className="overflow-x-auto">
                <ContributionGraph
                  weeks={
                    overview.viewer.githubContributions?.weeks ?? undefined
                  }
                  totalContributions={
                    overview.viewer.githubContributions?.totalContributions ??
                    undefined
                  }
                  loading={isSyncing && !overview.viewer.githubContributions}
                  unavailable={
                    !isSyncing &&
                    (!overview.viewer.githubContributions?.weeks ||
                      overview.viewer.githubContributions.weeks.length === 0)
                  }
                />
              </div>
            </div>
          </div>

          <div className="grid gap-8 py-7 lg:grid-cols-[minmax(0,1.75fr)_minmax(280px,0.95fr)]">
            <aside className="order-first lg:order-last">
              <div className="lg:sticky lg:top-6">
                <ProfileNetworkSection
                  activeTab={network}
                  emptyLabel={
                    network === 'followers'
                      ? 'no followers yet.'
                      : 'not following anyone yet.'
                  }
                  hasMore={hasMoreSocial}
                  items={socialItems.map((item) => ({
                    ...item,
                    userId: String(item.userId),
                  }))}
                  loading={networkIsLoading}
                  loadingMore={loadingMoreGraph === network}
                  onChangeTab={(nextTab) =>
                    navigateSearch({ network: nextTab })
                  }
                  onLoadMore={() => void handleLoadMoreGraph(network)}
                  onSelectUser={(username) =>
                    void navigate({
                      to: '/u/$username',
                      params: { username },
                      search: { tab: 'projects', network: 'followers' },
                    })
                  }
                />
              </div>
            </aside>

            <section>
              <ProfileContentTabs
                activeTab={tab}
                isRoutePending={isRoutePending}
                tabs={tabs}
                onSelectTab={(nextTab) => {
                  void prefetchTab(nextTab)
                  navigateSearch({ tab: nextTab })
                }}
              />

              <div className="pt-7">
                {contentIsLoading && (
                  <div className="font-mono text-[12px] text-text-faint">
                    loading {tab}…
                  </div>
                )}

                {!contentIsLoading && tab === 'projects' && (
                  <div className="flex flex-col gap-3.5">
                    <div className="rounded-card border border-line bg-surface px-4 py-4 shadow-card">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <div className="mb-1 font-mono text-[12px] text-text">
                            Missing a repo on your profile?
                          </div>
                          <div className="font-sans text-[13px] leading-6 text-text-muted">
                            Add, hide, restore, or pin repositories here instead
                            of digging through settings.
                          </div>
                        </div>
                        <RepositoryManagerDialog
                          buttonLabel="manage repositories"
                          buttonVariant="brand"
                          buttonSize="meta"
                          title="Manage profile repositories"
                          description="Choose which public GitHub repositories show up on your Locatic profile, and restore or pin the ones you want people to notice first."
                          pinnedProjectIds={
                            overview.viewer.pinnedProfileProjectIds
                          }
                          profileUsername={overview.viewer.githubUsername}
                          buttonClassName="w-full md:w-auto"
                        />
                      </div>
                    </div>

                    {projects.length === 0 && (
                      <div className="font-mono text-[12px] text-text-faint">
                        no projects imported yet.
                      </div>
                    )}
                    {projects.map((project) => {
                      const owner = getProjectCardOwner(project)
                      const repo = getProjectCardRepo(project)
                      const projectId = getProjectCardDbId(project)
                      const projectKey = getProjectCardId(project)
                      const isPinned = pinnedProjectIds.has(projectKey)

                      return (
                        <div
                          key={projectId}
                          className="rounded-card border border-line bg-transparent"
                        >
                          <div className="flex flex-col items-stretch gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0 font-mono text-[11px] text-text-faint">
                              {isPinned
                                ? 'pinned on profile'
                                : 'visible on profile'}
                            </div>
                            <Button
                              variant={isPinned ? 'brand' : 'monoOutline'}
                              size="meta"
                              onClick={() =>
                                void handleTogglePin(
                                  projectId,
                                  projectKey,
                                  isPinned,
                                )
                              }
                              disabled={pinPendingId === projectKey}
                              className="self-start font-mono sm:self-auto"
                            >
                              <Pin size={12} />
                              {pinPendingId === projectKey ? (
                                'saving…'
                              ) : (
                                <>
                                  <span className="sm:hidden">
                                    {isPinned ? 'unpin' : 'pin'}
                                  </span>
                                  <span className="hidden sm:inline">
                                    {isPinned ? 'unpinned' : 'pin to profile'}
                                  </span>
                                </>
                              )}
                            </Button>
                          </div>
                          <ProjectCard
                            project={{
                              ...toProjectCardData(project),
                              isPinned,
                            }}
                            showActions={false}
                            className="rounded-none border-0"
                            authorLink={{
                              username: project.authorHandle,
                              search: { tab: 'projects' },
                            }}
                            projectLink={{ owner, repo }}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}

                {!contentIsLoading && tab === 'posts' && (
                  <ProfilePostList posts={posts} emptyLabel="no posts yet." />
                )}

                {!contentIsLoading && tab === 'contributions' && (
                  <div className="flex flex-col gap-3.5">
                    {contributions.length === 0 && (
                      <div className="font-mono text-[12px] text-text-faint">
                        no matched contributions yet.
                      </div>
                    )}
                    {contributions.map((entry) => {
                      const owner = getProjectCardOwner(entry.project)
                      const repo = getProjectCardRepo(entry.project)

                      return (
                        <div
                          key={getProjectCardId(entry.project)}
                          className="rounded-card border border-line bg-transparent"
                        >
                          <div className="border-b border-line px-4 py-3 font-mono text-[11px] text-text-faint">
                            contributor · {compactNumber(entry.commitCount)}{' '}
                            commits matched
                          </div>
                          <ProjectCard
                            project={toProjectCardData(entry.project)}
                            showActions={false}
                            className="rounded-none border-0"
                            authorLink={{
                              username: entry.project.authorHandle,
                              search: { tab: 'projects' },
                            }}
                            projectLink={{ owner, repo }}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}

                {!contentIsLoading && tab === 'comments' && (
                  <div className="flex flex-col gap-4">
                    {comments.map((comment) => (
                      <button
                        key={String(comment._id)}
                        type="button"
                        onClick={() => openCommentTarget(comment)}
                        disabled={!isCommentTargetOpenable(comment)}
                        className={`rounded-[6px] border px-4.5 py-4 text-left transition-colors ${
                          isCommentTargetOpenable(comment)
                            ? 'border-line bg-surface hover:border-line-strong hover:bg-surface-alt'
                            : 'border-line bg-surface/70 opacity-70'
                        }`}
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2.5">
                          <span className="font-mono text-[11px] text-text-faint">
                            {comment.targetLabel}
                          </span>
                          <span className="font-mono text-[11px] text-text-faint">
                            {relativeTime(comment.createdAt)}
                          </span>
                        </div>
                        <p className="m-0 font-sans text-[13.5px] leading-[1.6] text-text">
                          {comment.content}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[11px] text-text-faint">
                          <span>
                            {comment.likesCount}{' '}
                            {comment.likesCount === 1 ? 'like' : 'likes'}
                          </span>
                          <span>
                            {comment.replyCount}{' '}
                            {comment.replyCount === 1 ? 'reply' : 'replies'}
                          </span>
                          <span>{commentAvailabilityCopy(comment)}</span>
                        </div>
                      </button>
                    ))}
                    {comments.length === 0 && (
                      <div className="font-mono text-[12px] text-text-faint">
                        no comments yet.
                      </div>
                    )}
                  </div>
                )}

                {!contentIsLoading && tab === 'liked' && (
                  <div className="flex flex-col gap-3.5">
                    {likedProjects.length === 0 && (
                      <div className="font-mono text-[12px] text-text-faint">
                        no liked projects yet.
                      </div>
                    )}
                    {likedProjects.map((likedProject) => {
                      const owner = getProjectCardOwner(likedProject.project)
                      const repo = getProjectCardRepo(likedProject.project)

                      return (
                        <ProjectCard
                          key={String(likedProject.projectId)}
                          project={{
                            ...toProjectCardData(likedProject.project),
                            liked: true,
                          }}
                          showActions={false}
                          authorLink={{
                            username: likedProject.project.authorHandle,
                            search: { tab: 'projects' },
                          }}
                          projectLink={{ owner, repo }}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
