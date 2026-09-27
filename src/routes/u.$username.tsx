import { useAuth } from '@clerk/tanstack-react-start'
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useEffect, useState, useTransition } from 'react'
import {
  Link,
  createFileRoute,
  notFound,
  useRouterState,
} from '@tanstack/react-router'
import type { Id } from '../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { AppLayout } from '@/components/app-shell/app-layout'
import {
  ProfileRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '@/components/app-shell/route-pending'
import {
  mapViewerBootstrap,
  type ProjectCardPreview,
  type ContributedProjectPreview,
  type ProfileCommentPreview,
  type ProfilePostPreview,
  type ProfileSocialPagePayload,
  type ViewerBootstrapPayload,
} from '@/features/contracts'
import {
  publicFollowGraphQueryOptions,
  publicProfileCommentsQueryOptions,
  publicProfileContributionsQueryOptions,
  publicProfileLikedProjectsQueryOptions,
  publicProfileOverviewQueryOptions,
  publicProfilePostsQueryOptions,
  publicProfileProjectsQueryOptions,
  publicProfileShippingLogQueryOptions,
} from '@/features/profile/queries'
import {
  emptySocialPage,
  getProfileContentTabs,
  isProfileContributionsPublic,
  mergeSocialItems,
  normalizeProfileSearch,
  type ProfileContentTab,
  type ProfileNetworkTab,
} from '@/features/profile/state'
import type { PublicProfileOverview } from '@/features/profile/types'
import { ProfileContentTabs } from '@/features/profile/content-tabs'
import { getProfileCommentDestination } from '@/features/profile/comment-navigation'
import { ProfileNetworkSection } from '@/features/profile/network-section'
import { ProfilePostList } from '@/features/profile/post-list'
import { ProfileCommentList } from '@/features/profile/comment-list'
import { ProfileContentSkeleton } from '@/features/profile/content-skeleton'
import { ProfileShippingLog } from '@/features/profile/shipping-log'
import {
  ProfileContributionSection,
  ProfileHeader,
  ProfileLanguagesSection,
  ProfileMeta,
  ProfileNetworkAndActivity,
  ProfilePinnedSection,
  ProfileRecentWorkSection,
  ProfileSignUpCta,
  ProfileSocialActions,
} from '@/features/profile/profile-sections'
import { useProfileFollow } from '@/features/profile/use-profile-follow'
import {
  BuilderNotFound,
  PublicProfileFrame,
} from '@/features/profile/public-profile-frame'
import { EmptyState } from '@/components/ui/empty-state'
import { PublicProfileContributionsList } from '@/features/profile/public-profile-contributions'
import { PublicProfileLikedProjectsList } from '@/features/profile/public-profile-liked-projects-list'
import { PublicProfileProjectsList } from '@/features/profile/public-profile-projects-list'
import { reportActionError } from '@/lib/action-error'
import { useSignInReturnHref } from '@/lib/return-href'
import { viewerQueryOptions } from '@/features/viewer/queries'
import { notificationsUnreadCountQueryOptions } from '@/features/notifications/queries'
import { useOpenConversation } from '@/features/inbox/use-open-conversation'

const TAB_QUERY_STALE_TIME = 60_000
const SOCIAL_PAGE_SIZE = 12

export const Route = createFileRoute('/u/$username')({
  validateSearch: normalizeProfileSearch,
  loaderDeps: ({ search }) => ({
    network: search.network ?? 'followers',
  }),
  loader: async ({ context, deps, params }) => {
    // The shipping log loads with the overview so it renders on the server
    // and does not shift the page when it arrives. It is a secondary
    // section: if it fails, the page renders without it and the component's
    // query retries on the client.
    const [overview] = await Promise.all([
      context.queryClient.ensureQueryData(
        publicProfileOverviewQueryOptions(params.username),
      ),
      context.queryClient
        .ensureQueryData(publicProfileShippingLogQueryOptions(params.username))
        .catch(() => null),
    ])

    // Missing and non-public profiles are a real 404, not an empty 200 page.
    if (!overview) {
      throw notFound()
    }

    if (overview.privacy.followGraphVisibility === 'public') {
      void context.queryClient.prefetchQuery(
        publicFollowGraphQueryOptions({
          username: params.username,
          kind: deps.network,
          paginationOpts: {
            cursor: null,
            numItems: SOCIAL_PAGE_SIZE,
          },
        }),
      )
    }

    return overview
  },
  // Each profile is its own page: remount on a new username so local state
  // (tabs, pending follow, open dialogs) never carries over to the next one.
  remountDeps: ({ params }) => params,
  pendingComponent: ProfileRoutePending,
  pendingMs: ROUTE_PENDING_MS,
  pendingMinMs: ROUTE_PENDING_MIN_MS,
  notFoundComponent: BuilderNotFound,
  component: PublicProfilePage,
})

function PublicProfilePage() {
  const { username } = Route.useParams()
  const { data: overview } = useSuspenseQuery(
    publicProfileOverviewQueryOptions(username),
  )
  const viewerQuery = useQuery(viewerQueryOptions())
  const viewerBootstrap = mapViewerBootstrap(
    viewerQuery.data as ViewerBootstrapPayload | undefined,
  )
  const viewer = viewerBootstrap?.viewer
  const notificationsQuery = useQuery({
    ...notificationsUnreadCountQueryOptions(),
    enabled: Boolean(viewer),
    staleTime: 30_000,
  })

  // The loader already 404s; this covers a profile that disappears or turns
  // private while the page is open.
  if (!overview) {
    return <BuilderNotFound />
  }

  const content = (
    <PublicProfileContent
      isOwnProfile={viewer?.githubUsername === overview.githubUsername}
      overview={overview}
      username={username}
    />
  )

  if (!viewer) {
    return <PublicProfileFrame>{content}</PublicProfileFrame>
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
      <div className="lx-page-scroll flex-1">{content}</div>
    </AppLayout>
  )
}

function PublicProfileActions({
  isOwnProfile,
  overview,
  username,
}: {
  isOwnProfile: boolean
  overview: PublicProfileOverview
  username: string
}) {
  const { isSignedIn } = useAuth()
  const signInRedirect = useSignInReturnHref(
    useRouterState({ select: (state) => state.location.href }),
  )
  const { isPending, toggleFollow } = useProfileFollow({
    githubUsername: overview.githubUsername,
    username,
    userId: overview.userId,
  })
  const { openConversation, pendingUserId } = useOpenConversation()

  if (isOwnProfile) {
    return (
      <Button asChild size="touch">
        <Link to="/profile" search={{ tab: 'projects' }}>
          your profile
        </Link>
      </Button>
    )
  }

  if (!isSignedIn) {
    return (
      <ProfileSignUpCta
        displayName={overview.profile.displayName}
        redirect={signInRedirect}
      />
    )
  }

  const following = overview.viewerFollowsProfile ?? false

  return (
    <ProfileSocialActions
      following={following}
      followPending={isPending}
      messagePending={pendingUserId === overview.userId}
      onMessage={() => void openConversation(overview.userId)}
      onToggleFollow={() => void toggleFollow(following)}
    />
  )
}

function PublicProfileContent({
  isOwnProfile,
  overview,
  username,
}: {
  isOwnProfile: boolean
  overview: PublicProfileOverview
  username: string
}) {
  const { isSignedIn } = useAuth()
  const navigate = Route.useNavigate()
  const { tab, network = 'followers' } = Route.useSearch()
  const queryClient = useQueryClient()
  const [isRoutePending, startRouteTransition] = useTransition()
  const [loadingMoreGraph, setLoadingMoreGraph] =
    useState<ProfileNetworkTab | null>(null)
  const [followersPage, setFollowersPage] =
    useState<ProfileSocialPagePayload>(emptySocialPage)
  const [followingPage, setFollowingPage] =
    useState<ProfileSocialPagePayload>(emptySocialPage)
  const isFollowGraphPublic =
    overview.privacy.followGraphVisibility === 'public'
  const showContributions = isProfileContributionsPublic(overview.privacy)
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

  const shippingLogQuery = useQuery({
    ...publicProfileShippingLogQueryOptions(username),
    staleTime: TAB_QUERY_STALE_TIME,
  })
  const projectsQuery = useQuery({
    ...publicProfileProjectsQueryOptions(username),
    enabled: tab === 'projects',
    staleTime: TAB_QUERY_STALE_TIME,
  })
  const postsQuery = useQuery({
    ...publicProfilePostsQueryOptions(username),
    enabled: tab === 'posts',
    staleTime: TAB_QUERY_STALE_TIME,
  })
  const contributionsQuery = useQuery({
    ...publicProfileContributionsQueryOptions(username),
    enabled: tab === 'contributions' && showContributions,
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
    void queryClient.prefetchQuery(publicProfilePostsQueryOptions(username))
    if (showContributions) {
      void queryClient.prefetchQuery(
        publicProfileContributionsQueryOptions(username),
      )
    }
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
      for (const kind of ['followers', 'following'] as const) {
        void queryClient.prefetchQuery(
          publicFollowGraphQueryOptions({
            username,
            kind,
            paginationOpts: {
              cursor: null,
              numItems: SOCIAL_PAGE_SIZE,
            },
          }),
        )
      }
    }
  }, [
    overview.privacy.commentHistoryVisibility,
    isFollowGraphPublic,
    overview.privacy.likedProjectsVisibility,
    queryClient,
    showContributions,
    username,
  ])

  const projects =
    (projectsQuery.data as Array<ProjectCardPreview> | null | undefined) ?? []
  const posts =
    (postsQuery.data as Array<ProfilePostPreview> | null | undefined) ?? []
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
    (tab === 'posts' && postsQuery.isLoading) ||
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

  const prefetchTab = (nextTab: ProfileContentTab) => {
    switch (nextTab) {
      case 'projects':
        return queryClient.prefetchQuery(
          publicProfileProjectsQueryOptions(username),
        )
      case 'posts':
        return queryClient.prefetchQuery(
          publicProfilePostsQueryOptions(username),
        )
      case 'contributions':
        if (!showContributions) {
          return Promise.resolve()
        }
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
        resetScroll: false,
      })
    })
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

      const merge = (current: ProfileSocialPagePayload) => ({
        ...page,
        page: mergeSocialItems(current.page, page.page),
      })
      if (kind === 'followers') {
        setFollowersPage(merge)
      } else {
        setFollowingPage(merge)
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

  const tabs = getProfileContentTabs([
    {
      count: overview.stats.projectsCount,
      id: 'projects',
      label: 'projects',
      mobileLabel: 'projects',
    },
    {
      count: overview.stats.postsCount,
      id: 'posts',
      label: 'posts',
      mobileLabel: 'posts',
    },
    {
      count: overview.stats.contributionsCount,
      id: 'contributions',
      label: 'contributions',
      mobileLabel: 'contrib',
    },
    {
      count: overview.stats.commentsCount,
      id: 'comments',
      label: 'comments',
      mobileLabel: 'comments',
    },
    {
      count: overview.stats.likedCount,
      id: 'liked',
      label: 'liked',
      mobileLabel: 'liked',
    },
  ] as const)

  const sortedComments = [...comments].sort(
    (left, right) => right.createdAt - left.createdAt,
  )
  const networkIsLoading =
    isFollowGraphPublic &&
    activeSocialQuery.isLoading &&
    activeSocialQuery.data === undefined

  const openCommentTarget = (comment: ProfileCommentPreview) => {
    const destination = getProfileCommentDestination(comment)
    if (!destination) {
      return
    }

    void navigate(destination)
  }

  return (
    <div className="lx-page-width-profile flex flex-col gap-8">
      <ProfileHeader
        avatarUrl={overview.profile.avatarUrl || null}
        bio={overview.profile.bio}
        buildStatus={overview.profile.buildStatus}
        displayName={overview.profile.displayName}
        githubUsername={overview.githubUsername}
        location={overview.profile.location}
        meta={
          <ProfileMeta
            followersCount={overview.stats.followersCount}
            followingCount={overview.stats.followingCount}
            githubUsername={overview.githubUsername}
            onSelectNetwork={
              isFollowGraphPublic
                ? (nextTab) => navigateSearch({ network: nextTab })
                : undefined
            }
            socialLinks={overview.profile.socialLinks}
          />
        }
        actions={
          <PublicProfileActions
            isOwnProfile={isOwnProfile}
            overview={overview}
            username={username}
          />
        }
      />

      <ProfilePinnedSection projects={overview.pinnedProjects} />

      <ProfileRecentWorkSection
        posts={overview.recentPosts}
        projects={overview.recentProjects}
        reactionsDisabled={!isSignedIn}
      />

      <ProfileShippingLog entries={shippingLogQuery.data ?? []} />

      <ProfileContributionSection
        githubContributions={overview.githubContributions}
      />

      <ProfileLanguagesSection
        projects={[...overview.pinnedProjects, ...overview.recentProjects]}
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
            isPrivate={!isFollowGraphPublic}
            items={socialItems.map((item) => ({
              ...item,
              userId: String(item.userId),
            }))}
            loading={networkIsLoading}
            loadingMore={loadingMoreGraph === network}
            onChangeTab={(nextTab) => {
              if (isFollowGraphPublic) {
                navigateSearch({ network: nextTab })
              }
            }}
            onLoadMore={() => void handleLoadMoreGraph(network)}
            onSelectUser={(nextUsername) =>
              void navigate({
                to: '/u/$username',
                params: { username: nextUsername },
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
                <PublicProfileProjectsList projects={projects} />
              )}

              {!contentIsLoading && tab === 'posts' && (
                <ProfilePostList
                  posts={posts}
                  emptyLabel="no public posts yet."
                  reactionsDisabled={!isSignedIn}
                />
              )}

              {!contentIsLoading && tab === 'contributions' && (
                <PublicProfileContributionsList
                  contributions={contributions}
                  visible={showContributions}
                />
              )}

              {!contentIsLoading &&
                tab === 'comments' &&
                (overview.privacy.commentHistoryVisibility !== 'public' ? (
                  <EmptyState
                    size="compact"
                    headingLevel={3}
                    title="comment history is private on this profile."
                  />
                ) : (
                  <ProfileCommentList
                    authorAvatarUrl={overview.profile.avatarUrl}
                    authorName={overview.profile.displayName}
                    comments={sortedComments}
                    emptyLabel="no public comments yet."
                    onOpenComment={openCommentTarget}
                    reactionsDisabled={!isSignedIn}
                  />
                ))}

              {!contentIsLoading && tab === 'liked' && (
                <PublicProfileLikedProjectsList
                  likedProjects={likedProjects}
                  visible={
                    overview.privacy.likedProjectsVisibility === 'public'
                  }
                />
              )}
            </div>
          </>
        }
      />
    </div>
  )
}
