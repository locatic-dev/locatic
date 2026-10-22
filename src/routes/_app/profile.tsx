import { Link, createFileRoute } from '@tanstack/react-router'
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useSignOut } from '@/integrations/clerk/sign-out'
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
  publicProfileOverviewQueryOptions,
  publicProfileShippingLogQueryOptions,
} from '@/features/profile/queries'
import {
  emptySocialPage,
  getPinToggleCopy,
  mergeSocialItems,
  normalizeProfileSearch,
  type ProfileContentTab,
  type ProfileNetworkTab,
} from '@/features/profile/state'
import { ProfileContentTabs } from '@/features/profile/content-tabs'
import { ProfileShippingLog } from '@/features/profile/shipping-log'
import { getProfileCommentDestination } from '@/features/profile/comment-navigation'
import { ProfileMobileAccountActions } from '@/features/profile/mobile-account-actions'
import { ProfileNetworkSection } from '@/features/profile/network-section'
import { ProfilePostList } from '@/features/profile/post-list'
import { ProfileCommentList } from '@/features/profile/comment-list'
import { ProfileContentSkeleton } from '@/features/profile/content-skeleton'
import {
  ProfileContributionSection,
  ProfileHeader,
  ProfileLanguagesSection,
  ProfileMeta,
  ProfileNetworkAndActivity,
  ProfilePinnedSection,
  ProfileRecentWorkSection,
} from '@/features/profile/profile-sections'
import { PublicProfileProjectsList } from '@/features/profile/public-profile-projects-list'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { compactNumber } from '@/lib/format'
import { ProjectCard } from '@/components/ui/project-card'
import { CardSheet } from '@/components/ui/card-sheet'
import { ProjectReactionBar } from '@/features/projects/reactions/project-reaction-bar'
import {
  ProfileRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '@/components/app-shell/route-pending'
import { usePinOwnedProject } from '@/features/projects/mutations'
import { useRefreshProjectSync } from '@/features/projects/use-refresh-project-sync'
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
import { reportActionError } from '@/lib/action-error'
import { showUndoToast } from '@/lib/undo-toast'
import { Pin } from '@/lib/icons'
import { shouldPrefetchPrivateConvexQueries } from '@/lib/auth-routing'
import { seo } from '@/lib/seo'

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

    // Pinned projects, recent work and the shipping log come from the public
    // profile queries, so the owner sees exactly what visitors see. The
    // shipping log is secondary: a failure leaves it to the client query.
    await Promise.all([
      context.queryClient
        .ensureQueryData(
          publicProfileShippingLogQueryOptions(overview.viewer.github.username),
        )
        .catch(() => null),
      context.queryClient.ensureQueryData(
        privateFollowGraphQueryOptions({
          kind: deps.network,
          paginationOpts: {
            cursor: null,
            numItems: SOCIAL_PAGE_SIZE,
          },
        }),
      ),
      context.queryClient.ensureQueryData(
        publicProfileOverviewQueryOptions(overview.viewer.github.username),
      ),
    ])

    return overview
  },
  pendingComponent: ProfileRoutePending,
  pendingMs: ROUTE_PENDING_MS,
  pendingMinMs: ROUTE_PENDING_MIN_MS,
  head: () => seo({ title: 'your profile', noindex: true }),
  component: ProfilePage,
})

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
  const signOut = useSignOut()
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
  const ownProfileQueryKey = publicProfileOverviewQueryOptions(
    overview.viewer.githubUsername,
  ).queryKey
  const showcaseQuery = useQuery(
    publicProfileOverviewQueryOptions(overview.viewer.githubUsername),
  )
  const showcase = showcaseQuery.data ?? null
  const shippingLogQuery = useQuery(
    publicProfileShippingLogQueryOptions(overview.viewer.githubUsername),
  )
  const projectSync = useRefreshProjectSync(() =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ownProfileQueryKey }),
      queryClient.invalidateQueries({
        queryKey: privateProfileProjectsQueryOptions().queryKey,
      }),
    ]),
  )
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

  // Shared by the pin toggle and its undo; rejects so each caller reports.
  const setProjectPinned = async (
    projectId: Id<'projects'>,
    projectKey: string,
    nextPinned: boolean,
  ) => {
    setPinPendingId(projectKey)
    try {
      await pinOwnedProject({
        pinned: nextPinned,
        projectId,
      })
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: privateProfileOverviewQueryOptions().queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: privateProfileProjectsQueryOptions().queryKey,
        }),
        queryClient.invalidateQueries({ queryKey: ownProfileQueryKey }),
      ])
    } finally {
      setPinPendingId(null)
    }
  }

  const handleTogglePin = async (
    projectId: Id<'projects'>,
    projectKey: string,
    pinned: boolean,
    repo: string,
  ) => {
    if (pinPendingId === projectKey) {
      return
    }

    try {
      await setProjectPinned(projectId, projectKey, !pinned)
    } catch (error) {
      reportActionError(error, {
        title: pinned ? "couldn't unpin" : "couldn't pin",
        retry: () => handleTogglePin(projectId, projectKey, pinned, repo),
      })
      return
    }

    if (pinned) {
      showUndoToast({
        message: `unpinned ${repo}`,
        undo: () => setProjectPinned(projectId, projectKey, true),
      })
    }
  }

  const renderPinToggle = (project: ProjectCardPreview) => {
    const projectId = getProjectCardDbId(project)
    const projectKey = getProjectCardId(project)
    const isPinned = pinnedProjectIds.has(projectKey)
    const repo = getProjectCardRepo(project)
    const copy = getPinToggleCopy({
      isPinned,
      pending: pinPendingId === projectKey,
      repo,
    })

    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          void handleTogglePin(projectId, projectKey, isPinned, repo)
        }
        disabled={pinPendingId === projectKey}
        aria-label={copy.accessibleName}
        aria-pressed={isPinned}
        className="max-md:min-h-11"
      >
        <Pin size={12} />
        {copy.label}
      </Button>
    )
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
      reportActionError(error, {
        title: "couldn't load more",
        retry: () => handleLoadMoreGraph(kind),
      })
    } finally {
      setLoadingMoreGraph(null)
    }
  }

  const networkIsLoading =
    activeSocialQuery.isLoading && activeSocialQuery.data === undefined

  const manageRepositoriesDialog = (
    <RepositoryManagerDialog
      buttonLabel="manage repositories"
      buttonVariant="primary"
      buttonSize="touch"
      title="Manage profile repositories"
      description="Choose which public GitHub repositories show up on your Locatic profile, and restore or pin the ones you want people to notice first."
      pinnedProjectIds={overview.viewer.pinnedProfileProjectIds}
      profileUsername={overview.viewer.githubUsername}
      buttonClassName="w-full md:w-auto"
    />
  )

  return (
    <div className="lx-page-shell">
      <div className="lx-page-scroll flex-1">
        <div className="lx-page-width-profile flex flex-col gap-8">
          <ProfileHeader
            avatarUrl={overview.viewer.avatarUrl || null}
            bio={overview.viewer.bio}
            buildStatus={overview.viewer.buildStatus}
            displayName={overview.viewer.displayName}
            githubUsername={overview.viewer.githubUsername}
            location={showcase?.profile.location ?? { kind: 'none' }}
            meta={
              <ProfileMeta
                followersCount={overview.viewer.stats.followersCount}
                followingCount={overview.viewer.stats.followingCount}
                githubUsername={overview.viewer.githubUsername}
                onSelectNetwork={(nextTab) =>
                  navigateSearch({ network: nextTab })
                }
                socialLinks={overview.viewer.socialLinks}
              />
            }
            actions={
              <>
                <Button asChild size="touch" className="max-md:hidden">
                  <Link to="/settings" search={{ tab: 'account' }}>
                    edit profile
                  </Link>
                </Button>
                <Button asChild size="touch" variant="ghost">
                  <Link to="/saved">saved</Link>
                </Button>
                <ProfileMobileAccountActions onSignOut={signOut} />
              </>
            }
          />

          <ProfilePinnedSection
            loading={showcaseQuery.isLoading}
            projects={showcase?.pinnedProjects ?? []}
            renderProjectAction={renderPinToggle}
            retrySync={projectSync}
            emptyContent={
              <Card
                density="cozy"
                className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
              >
                <p className="m-0 text-body text-text-muted">
                  pin up to three projects so visitors see them first.
                </p>
                {manageRepositoriesDialog}
              </Card>
            }
          />

          <ProfileRecentWorkSection
            loading={showcaseQuery.isLoading}
            posts={showcase?.recentPosts ?? []}
            projects={showcase?.recentProjects ?? []}
            reactionsDisabled={false}
            renderProjectAction={renderPinToggle}
            retrySync={projectSync}
          />

          <ProfileShippingLog entries={shippingLogQuery.data ?? []} />

          <ProfileContributionSection
            githubContributions={overview.viewer.githubContributions}
            loading={isSyncing}
          />

          <ProfileLanguagesSection
            projects={[
              ...(showcase?.pinnedProjects ?? []),
              ...(showcase?.recentProjects ?? []),
            ]}
          />

          <ProfileNetworkAndActivity
            network={
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
                onChangeTab={(nextTab) => navigateSearch({ network: nextTab })}
                onLoadMore={() => void handleLoadMoreGraph(network)}
                onSelectUser={(username) =>
                  void navigate({
                    to: '/u/$username',
                    params: { username },
                    search: { tab: 'projects', network: 'followers' },
                  })
                }
              />
            }
            activity={
              <>
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
                  {contentIsLoading && <ProfileContentSkeleton />}

                  {!contentIsLoading && tab === 'projects' && (
                    <div className="flex flex-col gap-3">
                      <Card
                        density="cozy"
                        className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="mb-1 text-label text-text">
                            missing a repo on your profile?
                          </div>
                          <p className="m-0 text-body text-text-muted">
                            add, hide, restore, or pin repositories here instead
                            of digging through settings.
                          </p>
                        </div>
                        {manageRepositoriesDialog}
                      </Card>

                      {projects.length === 0 ? (
                        <EmptyState
                          size="compact"
                          headingLevel={3}
                          title="no projects imported yet."
                        />
                      ) : (
                        <PublicProfileProjectsList
                          projects={projects}
                          renderTopLeftSlot={renderPinToggle}
                          retrySync={projectSync}
                        />
                      )}
                    </div>
                  )}

                  {!contentIsLoading && tab === 'posts' && (
                    <ProfilePostList posts={posts} emptyLabel="no posts yet." />
                  )}

                  {!contentIsLoading && tab === 'contributions' && (
                    <div className="flex flex-col gap-3">
                      {contributions.length === 0 && (
                        <EmptyState
                          size="compact"
                          headingLevel={3}
                          title="no matched contributions yet."
                        />
                      )}
                      {contributions.length > 0 && (
                        <CardSheet className="flex flex-col gap-2 overflow-visible border-0 bg-transparent divide-y-0">
                          {contributions.map((entry) => {
                            const owner = getProjectCardOwner(entry.project)
                            const repo = getProjectCardRepo(entry.project)

                            return (
                              <div
                                key={getProjectCardId(entry.project)}
                                className="overflow-hidden rounded-card border border-line bg-surface"
                              >
                                <div className="border-b border-line px-4 py-3 text-eyebrow text-text-muted">
                                  contributor ·{' '}
                                  {compactNumber(entry.commitCount)} commits
                                  matched
                                </div>
                                <ProjectCard
                                  project={toProjectCardData(entry.project)}
                                  showActions={false}
                                  reactionSlot={
                                    <ProjectReactionBar
                                      projectId={getProjectCardDbId(
                                        entry.project,
                                      )}
                                      reactionCounts={
                                        entry.project.reactionCounts
                                      }
                                      viewerReactionTypes={
                                        entry.project.viewerReactionTypes
                                      }
                                    />
                                  }
                                  className="rounded-none border-0 focus-visible:ring-inset"
                                  authorLink={{
                                    username: entry.project.authorHandle,
                                    search: { tab: 'projects' },
                                  }}
                                  projectLink={{ owner, repo }}
                                />
                              </div>
                            )
                          })}
                        </CardSheet>
                      )}
                    </div>
                  )}

                  {!contentIsLoading && tab === 'comments' && (
                    <ProfileCommentList
                      authorAvatarUrl={overview.viewer.avatarUrl}
                      authorName={overview.viewer.displayName}
                      comments={comments}
                      emptyLabel="no comments yet."
                      onOpenComment={openCommentTarget}
                      reactionsDisabled={false}
                    />
                  )}

                  {!contentIsLoading && tab === 'liked' && (
                    <div className="flex flex-col gap-3">
                      {likedProjects.length === 0 && (
                        <EmptyState
                          size="compact"
                          headingLevel={3}
                          title="no liked projects yet."
                        />
                      )}
                      {likedProjects.length > 0 && (
                        <CardSheet>
                          {likedProjects.map((likedProject) => {
                            const owner = getProjectCardOwner(
                              likedProject.project,
                            )
                            const repo = getProjectCardRepo(
                              likedProject.project,
                            )

                            return (
                              <ProjectCard
                                key={String(likedProject.projectId)}
                                project={toProjectCardData(
                                  likedProject.project,
                                )}
                                showActions={false}
                                reactionSlot={
                                  <ProjectReactionBar
                                    projectId={likedProject.projectId}
                                    reactionCounts={
                                      likedProject.project.reactionCounts
                                    }
                                    viewerReactionTypes={[
                                      ...new Set([
                                        ...(likedProject.project
                                          .viewerReactionTypes ?? []),
                                        'like',
                                      ]),
                                    ]}
                                    liked
                                  />
                                }
                                className="focus-visible:ring-inset"
                                authorLink={{
                                  username: likedProject.project.authorHandle,
                                  search: { tab: 'projects' },
                                }}
                                projectLink={{ owner, repo }}
                              />
                            )
                          })}
                        </CardSheet>
                      )}
                    </div>
                  )}
                </div>
              </>
            }
          />
        </div>
      </div>
    </div>
  )
}
