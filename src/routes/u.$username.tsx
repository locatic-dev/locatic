import { useAuth } from '@clerk/tanstack-react-start'
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useEffect, useState, useTransition } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import type { Id } from '../../convex/_generated/dataModel'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { StatusPill } from '@/components/ui/status-pill'
import { BrandIcon } from '@/components/ui/brand-icon'
import { ContributionGraph } from '@/components/ui/contribution-graph'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { AppLayout } from '@/components/app-shell/app-layout'
import { compactNumber } from '@/lib/format'
import { relativeTime } from '@/lib/time'
import { ProjectCard } from '@/components/ui/project-card'
import {
  mapPublicProfileOverview,
  mapViewerBootstrap,
  type ContributedProjectPreview,
  type ProjectCardPreview,
  type ProfileCommentPreview,
  type ProfileSocialPagePayload,
  type PublicProfileOverviewPayload,
  type ViewerBootstrapPayload,
} from '@/features/contracts'
import {
  getProjectCardFullName,
  getProjectCardId,
  getProjectCardOwner,
  getProjectCardRepo,
  toProjectCardData,
} from '@/features/project-card-preview'
import {
  publicFollowGraphQueryOptions,
  publicProfileCommentsQueryOptions,
  publicProfileContributionsQueryOptions,
  publicProfileLikedProjectsQueryOptions,
  publicProfileOverviewQueryOptions,
  publicProfileProjectsQueryOptions,
} from '@/features/profile/queries'
import {
  normalizeProfileSearch,
  type ProfileContentTab,
  type ProfileNetworkTab,
} from '@/features/profile/state'
import { ProfileNetworkSection } from '@/features/profile/network-section'
import { socialLinkHref } from '@/lib/social-links'
import { useFollowUser, useUnfollowUser } from '@/features/follows/mutations'
import { viewerQueryOptions } from '@/features/viewer/queries'
import { notificationsUnreadCountQueryOptions } from '@/features/notifications/queries'
import { useOpenConversation } from '@/features/inbox/use-open-conversation'

const TAB_QUERY_STALE_TIME = 60_000
const SOCIAL_PAGE_SIZE = 12

function isCommentTargetOpenable(
  comment: ProfileCommentPreview,
): comment is ProfileCommentPreview & {
  projectOwner: string
  projectRepo: string
  targetAvailability: 'available'
} {
  return (
    comment.targetAvailability === 'available' &&
    Boolean(comment.projectOwner) &&
    Boolean(comment.projectRepo)
  )
}

function commentAvailabilityCopy(comment: ProfileCommentPreview) {
  switch (comment.targetAvailability) {
    case 'available':
      return 'open in project'
    case 'hidden':
      return 'hidden from profile'
    case 'deleted':
    default:
      return 'project removed'
  }
}

export const Route = createFileRoute('/u/$username')({
  validateSearch: normalizeProfileSearch,
  loaderDeps: ({ search }) => ({
    network: search.network ?? 'followers',
  }),
  loader: ({ context, deps, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(
        publicProfileOverviewQueryOptions(params.username),
      ),
      context.queryClient.ensureQueryData(
        publicFollowGraphQueryOptions({
          username: params.username,
          kind: deps.network,
          paginationOpts: {
            cursor: null,
            numItems: SOCIAL_PAGE_SIZE,
          },
        }),
      ),
    ]),
  component: PublicProfilePage,
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

function PublicProfilePage() {
  const { username } = Route.useParams()
  const { data } = useSuspenseQuery(publicProfileOverviewQueryOptions(username))
  const viewerQuery = useQuery(viewerQueryOptions())
  const viewerBootstrap = mapViewerBootstrap(
    viewerQuery.data as ViewerBootstrapPayload | undefined,
  )
  const hasViewer = Boolean(viewerBootstrap?.viewer)
  const notificationsQuery = useQuery({
    ...notificationsUnreadCountQueryOptions(),
    enabled: hasViewer,
    staleTime: 30_000,
  })
  const overview = mapPublicProfileOverview(
    data as PublicProfileOverviewPayload | null | undefined,
  )

  if (!overview) {
    return (
      <div className="min-h-dvh bg-canvas">
        <header className="flex h-14 items-center border-b border-line px-8">
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            <Logo size={20} />
            <span className="font-mono text-sm font-bold text-text">
              locatic
            </span>
          </Link>
        </header>
        <div className="px-8 py-10 text-text-muted">
          profile not found or not publicly available.
        </div>
      </div>
    )
  }

  const viewer = viewerBootstrap?.viewer
  const content = (
    <PublicProfileContent
      inAppShell={Boolean(viewer)}
      overview={overview}
      username={username}
      viewerBootstrap={viewerBootstrap}
    />
  )

  if (!viewer) {
    return content
  }

  return (
    <AppLayout
      viewer={{
        avatarUrl: viewer.avatarUrl,
        city: viewer.cityName ?? undefined,
        displayName: viewer.displayName,
        githubUsername: viewer.githubUsername,
      }}
      unreadMessages={viewer.unreadMessagesCount}
      unreadNotifications={
        typeof notificationsQuery.data === 'number'
          ? notificationsQuery.data
          : 0
      }
    >
      {content}
    </AppLayout>
  )
}

function PublicProfileContent({
  inAppShell = false,
  overview,
  username,
  viewerBootstrap,
}: {
  inAppShell?: boolean
  overview: NonNullable<ReturnType<typeof mapPublicProfileOverview>>
  username: string
  viewerBootstrap: ReturnType<typeof mapViewerBootstrap>
}) {
  const { isSignedIn } = useAuth()
  const navigate = Route.useNavigate()
  const { tab, network = 'followers' } = Route.useSearch()
  const queryClient = useQueryClient()
  const [isRoutePending, startRouteTransition] = useTransition()
  const followUser = useFollowUser()
  const unfollowUser = useUnfollowUser()
  const { openConversation, pendingUserId } = useOpenConversation()
  const [loadingMoreGraph, setLoadingMoreGraph] =
    useState<ProfileNetworkTab | null>(null)
  const [followersPage, setFollowersPage] =
    useState<ProfileSocialPagePayload>(emptySocialPage)
  const [followingPage, setFollowingPage] =
    useState<ProfileSocialPagePayload>(emptySocialPage)
  const isFollowGraphPublic =
    overview.privacy.followGraphVisibility === 'public'
  const activeSocialQuery = useQuery({
    ...publicFollowGraphQueryOptions({
      username,
      kind: network,
      paginationOpts: {
        cursor: null,
        numItems: SOCIAL_PAGE_SIZE,
      },
    }),
    enabled: isFollowGraphPublic,
    staleTime: TAB_QUERY_STALE_TIME,
  })

  const projectsQuery = useQuery({
    ...publicProfileProjectsQueryOptions(username),
    enabled: tab === 'projects',
    staleTime: TAB_QUERY_STALE_TIME,
  })
  const contributionsQuery = useQuery({
    ...publicProfileContributionsQueryOptions(username),
    enabled: tab === 'contributions',
    staleTime: TAB_QUERY_STALE_TIME,
  })
  const commentsQuery = useQuery({
    ...publicProfileCommentsQueryOptions(username),
    enabled:
      tab === 'comments' &&
      overview.privacy.commentHistoryVisibility === 'public',
    staleTime: TAB_QUERY_STALE_TIME,
  })
  const likedProjectsQuery = useQuery({
    ...publicProfileLikedProjectsQueryOptions(username),
    enabled:
      tab === 'liked' && overview.privacy.likedProjectsVisibility === 'public',
    staleTime: TAB_QUERY_STALE_TIME,
  })

  useEffect(() => {
    const page = activeSocialQuery.data as ProfileSocialPagePayload | undefined
    if (!page) {
      return
    }

    if (network === 'followers') {
      setFollowersPage(page)
      return
    }

    setFollowingPage(page)
  }, [activeSocialQuery.data, network])

  useEffect(() => {
    void queryClient.prefetchQuery(publicProfileProjectsQueryOptions(username))
    void queryClient.prefetchQuery(
      publicProfileContributionsQueryOptions(username),
    )
    if (overview.privacy.commentHistoryVisibility === 'public') {
      void queryClient.prefetchQuery(
        publicProfileCommentsQueryOptions(username),
      )
    }
    if (overview.privacy.likedProjectsVisibility === 'public') {
      void queryClient.prefetchQuery(
        publicProfileLikedProjectsQueryOptions(username),
      )
    }
    if (isFollowGraphPublic) {
      void queryClient.prefetchQuery(
        publicFollowGraphQueryOptions({
          username,
          kind: 'followers',
          paginationOpts: {
            cursor: null,
            numItems: SOCIAL_PAGE_SIZE,
          },
        }),
      )
      void queryClient.prefetchQuery(
        publicFollowGraphQueryOptions({
          username,
          kind: 'following',
          paginationOpts: {
            cursor: null,
            numItems: SOCIAL_PAGE_SIZE,
          },
        }),
      )
    }
  }, [
    overview.privacy.commentHistoryVisibility,
    isFollowGraphPublic,
    overview.privacy.likedProjectsVisibility,
    queryClient,
    username,
  ])

  const isOwnProfile =
    viewerBootstrap?.viewer?.githubUsername === overview.githubUsername
  const githubHref = socialLinkHref('github', overview.githubUsername)
  const xHref = socialLinkHref('x', overview.profile.socialLinks.x)
  const linkedinHref = socialLinkHref(
    'linkedin',
    overview.profile.socialLinks.linkedin,
  )
  const blueskyHref = socialLinkHref(
    'bluesky',
    overview.profile.socialLinks.bluesky,
  )
  const websiteHref = socialLinkHref(
    'website',
    overview.profile.socialLinks.website,
  )

  const projects =
    (projectsQuery.data as Array<ProjectCardPreview> | null | undefined) ?? []
  const contributions =
    (contributionsQuery.data as
      | Array<ContributedProjectPreview>
      | null
      | undefined) ?? []
  const comments =
    (commentsQuery.data as Array<ProfileCommentPreview> | null | undefined) ??
    []
  const likedProjects =
    (likedProjectsQuery.data as
      | Array<{
          reactionId: Id<'reactions'>
          projectId: Id<'projects'>
          likedAt: number
          project: ProjectCardPreview
        }>
      | null
      | undefined) ?? []

  const contentIsLoading =
    (tab === 'projects' && projectsQuery.isLoading) ||
    (tab === 'contributions' && contributionsQuery.isLoading) ||
    (tab === 'comments' &&
      overview.privacy.commentHistoryVisibility === 'public' &&
      commentsQuery.isLoading) ||
    (tab === 'liked' &&
      overview.privacy.likedProjectsVisibility === 'public' &&
      likedProjectsQuery.isLoading)

  const socialItems =
    network === 'followers' ? followersPage.page : followingPage.page
  const hasMoreSocial =
    network === 'followers' ? !followersPage.isDone : !followingPage.isDone
  const profileQueryKey = publicProfileOverviewQueryOptions(username).queryKey

  const prefetchTab = (nextTab: ProfileContentTab) => {
    switch (nextTab) {
      case 'projects':
        return queryClient.prefetchQuery(
          publicProfileProjectsQueryOptions(username),
        )
      case 'contributions':
        return queryClient.prefetchQuery(
          publicProfileContributionsQueryOptions(username),
        )
      case 'comments':
        if (overview.privacy.commentHistoryVisibility === 'public') {
          return queryClient.prefetchQuery(
            publicProfileCommentsQueryOptions(username),
          )
        }
        return Promise.resolve()
      case 'liked':
        if (overview.privacy.likedProjectsVisibility === 'public') {
          return queryClient.prefetchQuery(
            publicProfileLikedProjectsQueryOptions(username),
          )
        }
        return Promise.resolve()
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
        to: '/u/$username',
        params: { username },
        search: (current) => ({ ...current, ...nextValues }),
      })
    })
  }

  const followMutation = useMutation({
    mutationFn: async ({ currentlyFollowed }: { currentlyFollowed: boolean }) =>
      currentlyFollowed
        ? unfollowUser({ targetUserId: overview.userId })
        : followUser({ targetUserId: overview.userId }),
    onMutate: async ({ currentlyFollowed }) => {
      await queryClient.cancelQueries({ queryKey: profileQueryKey })
      const previous =
        queryClient.getQueryData<PublicProfileOverviewPayload | null>(
          profileQueryKey,
        )

      queryClient.setQueryData<PublicProfileOverviewPayload | null>(
        profileQueryKey,
        (current) => {
          if (!current) {
            return current
          }

          const nextFollowed = !currentlyFollowed
          const delta = nextFollowed ? 1 : -1

          return {
            ...current,
            stats: {
              ...current.stats,
              followersCount: Math.max(0, current.stats.followersCount + delta),
            },
            viewerFollowsProfile: nextFollowed,
          }
        },
      )

      return { previous }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(profileQueryKey, context?.previous ?? null)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: profileQueryKey })
    },
  })

  const handleFollow = async () => {
    if (followMutation.isPending || isOwnProfile) {
      return
    }

    try {
      await followMutation.mutateAsync({
        currentlyFollowed: overview.viewerFollowsProfile,
      })
    } catch (error) {
      console.error(error)
    }
  }

  const handleLoadMoreGraph = async (kind: ProfileNetworkTab) => {
    if (loadingMoreGraph === kind) {
      return
    }

    const currentPage = kind === 'followers' ? followersPage : followingPage
    if (currentPage.isDone || !isFollowGraphPublic) {
      return
    }

    setLoadingMoreGraph(kind)

    try {
      const page = (await queryClient.fetchQuery(
        publicFollowGraphQueryOptions({
          username,
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

  const tabs = [
    { count: overview.stats.projectsCount, id: 'projects', label: 'projects' },
    {
      count: overview.stats.contributionsCount,
      id: 'contributions',
      label: 'contributions',
    },
    { count: overview.stats.commentsCount, id: 'comments', label: 'comments' },
    { count: overview.stats.likedCount, id: 'liked', label: 'liked' },
  ] as const

  const sortedComments = [...comments].sort(
    (left, right) => right.createdAt - left.createdAt,
  )

  const openCommentTarget = (comment: ProfileCommentPreview) => {
    if (!isCommentTargetOpenable(comment)) {
      return
    }

    void navigate({
      to: '/project/$owner/$repo',
      params: {
        owner: comment.projectOwner,
        repo: comment.projectRepo,
      },
      search: { comment: String(comment._id) },
      hash: `comment-${String(comment._id)}`,
    })
  }

  return (
    <div className="min-h-dvh bg-canvas">
      {!inAppShell && (
        <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-line px-(--lx-gutter) py-3">
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            <Logo size={20} />
            <span className="font-mono text-sm font-bold text-text">
              locatic
            </span>
          </Link>

          {isOwnProfile ? (
            <Button
              variant="outline"
              onClick={() =>
                void navigate({
                  to: '/profile',
                  search: { tab: 'projects', network },
                })
              }
              className="min-h-11 font-mono text-[12px]"
            >
              your profile
            </Button>
          ) : isSignedIn ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => void openConversation(overview.userId)}
                disabled={pendingUserId === overview.userId}
                className="min-h-11 font-mono text-[12px]"
              >
                {pendingUserId === overview.userId ? 'opening…' : 'message'}
              </Button>
              <Button
                variant={overview.viewerFollowsProfile ? 'outline' : 'default'}
                onClick={() => void handleFollow()}
                disabled={followMutation.isPending}
                className={
                  overview.viewerFollowsProfile
                    ? 'min-h-11 font-mono text-[12px]'
                    : 'min-h-11 font-mono text-[12px] font-semibold'
                }
              >
                {followMutation.isPending
                  ? 'working…'
                  : overview.viewerFollowsProfile
                    ? 'following'
                    : 'follow'}
              </Button>
            </div>
          ) : (
            <Link
              to="/sign-in/$"
              className="font-mono text-[12.5px] text-primary no-underline"
            >
              sign in
            </Link>
          )}
        </header>
      )}

      <div className="lx-page-width-detail py-8 pb-20">
        {inAppShell && (
          <div className="mb-6 flex flex-wrap justify-end gap-2">
            {isOwnProfile ? (
              <Button
                variant="outline"
                onClick={() =>
                  void navigate({
                    to: '/profile',
                    search: { tab: 'projects', network },
                  })
                }
                className="min-h-11 font-mono text-[12px]"
              >
                your profile
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => void openConversation(overview.userId)}
                  disabled={pendingUserId === overview.userId}
                  className="min-h-11 font-mono text-[12px]"
                >
                  {pendingUserId === overview.userId ? 'opening...' : 'message'}
                </Button>
                <Button
                  variant={
                    overview.viewerFollowsProfile ? 'outline' : 'default'
                  }
                  onClick={() => void handleFollow()}
                  disabled={followMutation.isPending}
                  className={
                    overview.viewerFollowsProfile
                      ? 'min-h-11 font-mono text-[12px]'
                      : 'min-h-11 font-mono text-[12px] font-semibold'
                  }
                >
                  {followMutation.isPending
                    ? 'working...'
                    : overview.viewerFollowsProfile
                      ? 'following'
                      : 'follow'}
                </Button>
              </>
            )}
          </div>
        )}

        <div className="mb-8 flex flex-col items-start gap-6">
          <LxAvatar
            name={overview.profile.displayName}
            avatarUrl={overview.profile.avatarUrl}
            size={88}
          />

          <div className="flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h1 className="m-0 font-mono text-[28px] font-bold tracking-[-0.02em] text-text">
                {overview.profile.displayName}
              </h1>
              <StatusPill status={overview.profile.buildStatus} size="md" />
            </div>

            <div className="mb-3 font-mono text-[13px] text-text-faint">
              @{overview.githubUsername}
              {overview.profile.city && <span> · {overview.profile.city}</span>}
            </div>

            {overview.profile.bio && (
              <p className="mb-4 max-w-130 font-sans text-sm leading-6 text-text-muted">
                {overview.profile.bio}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4 font-mono text-xs">
              {overview.privacy.followGraphVisibility === 'public' ? (
                <>
                  <button
                    type="button"
                    onClick={() => navigateSearch({ network: 'followers' })}
                    className="bg-transparent p-0 text-left font-mono text-xs text-inherit"
                  >
                    <strong className="text-text">
                      {compactNumber(overview.stats.followersCount)}
                    </strong>{' '}
                    <span className="text-text-faint">followers</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateSearch({ network: 'following' })}
                    className="bg-transparent p-0 text-left font-mono text-xs text-inherit"
                  >
                    <strong className="text-text">
                      {compactNumber(overview.stats.followingCount)}
                    </strong>{' '}
                    <span className="text-text-faint">following</span>
                  </button>
                </>
              ) : (
                <span className="text-text-faint">follow graph is private</span>
              )}
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
        </div>

        <div className="mb-8">
          <div className="mb-2.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-faint">
            {overview.githubContributions?.totalContributions != null
              ? `${overview.githubContributions.totalContributions.toLocaleString()} contributions this year`
              : 'contributions this year'}
          </div>
          <div className="overflow-x-auto">
            <ContributionGraph
              weeks={overview.githubContributions?.weeks ?? undefined}
              totalContributions={
                overview.githubContributions?.totalContributions ?? undefined
              }
              unavailable={
                !overview.githubContributions?.weeks ||
                overview.githubContributions.weeks.length === 0
              }
            />
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.75fr)_minmax(280px,0.95fr)]">
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
                isPrivate={!isFollowGraphPublic}
                items={socialItems.map((item) => ({
                  ...item,
                  userId: String(item.userId),
                }))}
                loadingMore={loadingMoreGraph === network}
                onChangeTab={(nextTab) => navigateSearch({ network: nextTab })}
                onLoadMore={() => void handleLoadMoreGraph(network)}
                onSelectUser={(nextUsername) =>
                  void navigate({
                    to: '/u/$username',
                    params: { username: nextUsername },
                    search: { tab: 'projects', network: 'followers' },
                  })
                }
              />
            </div>
          </aside>

          <section>
            <div className="overflow-x-auto overflow-y-hidden border-b border-line">
              <div className="flex min-w-max items-stretch gap-1">
                {tabs.map((tabItem) => (
                  <button
                    key={tabItem.id}
                    onClick={() => {
                      void prefetchTab(tabItem.id)
                      navigateSearch({ tab: tabItem.id })
                    }}
                    className={`relative inline-flex min-h-11 min-w-24 shrink-0 flex-1 items-center justify-center gap-1.75 px-3 py-3.5 text-center font-mono text-[12.5px] ${
                      tab === tabItem.id
                        ? 'font-semibold text-text'
                        : 'text-text-faint'
                    }`}
                    type="button"
                    aria-busy={isRoutePending && tab === tabItem.id}
                  >
                    {tabItem.label}
                    <span className="rounded-pill bg-surface-alt px-1.5 py-px text-[10.5px] leading-[1.3] text-text-faint">
                      {tabItem.count}
                    </span>
                    {tab === tabItem.id && (
                      <div className="absolute bottom-0 left-3 right-3 h-0.5 bg-brand" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-7">
              {contentIsLoading && (
                <div className="font-mono text-[12px] text-text-faint">
                  loading {tab}…
                </div>
              )}

              {!contentIsLoading && tab === 'projects' && (
                <div className="flex flex-col gap-3.5">
                  {projects.length === 0 ? (
                    <div className="py-4.5 font-sans text-sm text-text-muted">
                      no public projects yet.
                    </div>
                  ) : (
                    projects.map((project) => {
                      const owner = getProjectCardOwner(project)
                      const repo = getProjectCardRepo(project)

                      return (
                        <ProjectCard
                          key={getProjectCardId(project)}
                          project={toProjectCardData(project)}
                          onAuthorClick={() =>
                            void navigate({
                              to: '/u/$username',
                              params: { username: owner },
                              search: { tab: 'projects', network: 'followers' },
                            })
                          }
                          onCardClick={() =>
                            void navigate({
                              to: '/project/$owner/$repo',
                              params: { owner, repo },
                              search: { comment: null },
                            })
                          }
                          showActions={false}
                        />
                      )
                    })
                  )}
                </div>
              )}

              {!contentIsLoading && tab === 'contributions' && (
                <div className="flex flex-col gap-3.5">
                  {contributions.length === 0 ? (
                    <div className="py-4.5 font-sans text-sm text-text-muted">
                      no public contributions yet.
                    </div>
                  ) : (
                    contributions.map((entry) => {
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
                            onAuthorClick={() =>
                              void navigate({
                                to: '/u/$username',
                                params: { username: owner },
                                search: {
                                  tab: 'projects',
                                  network: 'followers',
                                },
                              })
                            }
                            onCardClick={() =>
                              void navigate({
                                to: '/project/$owner/$repo',
                                params: { owner, repo },
                                search: { comment: null },
                              })
                            }
                            showActions={false}
                            className="rounded-none border-0"
                          />
                        </div>
                      )
                    })
                  )}
                </div>
              )}

              {!contentIsLoading && tab === 'comments' && (
                <div className="flex flex-col gap-3.5">
                  {overview.privacy.commentHistoryVisibility !== 'public' ? (
                    <div className="py-4.5 font-sans text-sm text-text-muted">
                      comment history is private on this profile.
                    </div>
                  ) : sortedComments.length === 0 ? (
                    <div className="py-4.5 font-sans text-sm text-text-muted">
                      no public comments yet.
                    </div>
                  ) : (
                    sortedComments.map((comment) => (
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
                          <span className="font-mono text-[11.5px] text-text-faint">
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
                    ))
                  )}
                </div>
              )}

              {!contentIsLoading && tab === 'liked' && (
                <div className="flex flex-col gap-3">
                  {overview.privacy.likedProjectsVisibility !== 'public' ? (
                    <div className="py-4.5 font-sans text-sm text-text-muted">
                      liked projects are private on this profile.
                    </div>
                  ) : likedProjects.length === 0 ? (
                    <div className="py-4.5 font-sans text-sm text-text-muted">
                      no public likes yet.
                    </div>
                  ) : (
                    likedProjects.map((project) => {
                      const owner = getProjectCardOwner(project.project)
                      const repo = getProjectCardRepo(project.project)
                      return (
                        <button
                          key={String(project.reactionId)}
                          onClick={() =>
                            void navigate({
                              to: '/project/$owner/$repo',
                              params: {
                                owner: owner ?? overview.githubUsername,
                                repo,
                              },
                              search: { comment: null },
                            })
                          }
                          className="rounded-[6px] border border-line bg-surface px-4 py-3.5 text-left"
                          type="button"
                        >
                          <div className="mb-1 font-mono text-[13px] font-semibold text-text">
                            {getProjectCardFullName(project.project)}
                          </div>
                          <div className="font-mono text-[11px] text-text-faint">
                            liked {relativeTime(project.likedAt)}
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
