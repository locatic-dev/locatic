import { createFileRoute } from '@tanstack/react-router'
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import {
  builderSearchQueryOptions,
  exploreFeedQueryOptions,
  nearbyBuildersQueryOptions,
  postListQueryOptions,
  projectSearchQueryOptions,
  postSearchQueryOptions,
} from '@/features/explore/queries'
import { followingQueryOptions } from '@/features/follows/queries'
import {
  citiesByIdsQueryOptions,
  citiesSearchQueryOptions,
} from '@/features/cities/queries'
import { useLikeProject, useUnlikeProject } from '@/features/projects/mutations'
import { useFollowUser, useUnfollowUser } from '@/features/follows/mutations'
import {
  useDismissExplorePost,
  useDismissExploreProject,
  useResetExplorePosts,
  useResetExploreProjects,
} from '@/features/explore/mutations'
import { useOpenConversation } from '@/features/inbox/use-open-conversation'
import { disabledQuery } from '@/lib/query'
import {
  FeedRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '@/components/app-shell/route-pending'
import {
  mapViewerExplorePrefs,
  mapViewerLikedProjectIds,
  type ViewerExplorePrefsPayload,
  type ViewerLikedProjectIdsPayload,
} from '@/features/contracts'
import {
  viewerExplorePrefsQueryOptions,
  viewerLikedProjectIdsQueryOptions,
} from '@/features/viewer/queries'
import {
  areExploreCityIdsEqual,
  dedupeExploreCities,
  deriveDefaultExploreCityIds,
  getCanonicalExploreCityIds,
  getExploreCityIdentity,
  getExploreLoaderDeps,
  getExploreProjectCityIds,
  getNearbyBuilderCityIds,
  isExploreProjectFeedGlobal,
  normalizeExploreSearch,
  removeExploreCityId,
} from '@/features/explore/state'
import { ExploreHeader } from '@/features/explore/components/explore-header'
import { ExploreFeed } from '@/features/explore/components/explore-feed'
import {
  keepPreviousExploreFeedData,
  keepPreviousPostListData,
  keepPreviousPostSearchData,
} from '@/features/explore/query-transitions'
import { useDebouncedRouteSearch } from '@/features/explore/use-debounced-route-search'
import {
  updateExploreFeedPayload,
  updateLikedProjectIdsPayload,
} from '@/features/explore/cache'
import { shouldPrefetchPrivateConvexQueries } from '@/lib/auth-routing'
import type {
  BuilderPreview,
  ExploreFeedPayload,
} from '@/features/explore/types'

const EXPLORE_INITIAL_LIMIT = 20
const EXPLORE_MAX_LIMIT = 50
const EXPLORE_LIMIT_STEP = 20

export const Route = createFileRoute('/_app/explore')({
  validateSearch: normalizeExploreSearch,
  loaderDeps: ({ search }) => getExploreLoaderDeps(search),
  loader: async ({ context, deps }) => {
    if (!shouldPrefetchPrivateConvexQueries()) {
      return
    }

    const [explorePrefsData] = await Promise.all([
      context.queryClient.ensureQueryData(viewerExplorePrefsQueryOptions()),
      context.queryClient.ensureQueryData(viewerLikedProjectIdsQueryOptions()),
    ])
    const explorePrefs = mapViewerExplorePrefs(
      explorePrefsData as ViewerExplorePrefsPayload | undefined,
    )
    if (!explorePrefs) {
      return
    }

    const defaultCityIds = deriveDefaultExploreCityIds(explorePrefs)
    const selectedCityIds = getExploreProjectCityIds(
      deps,
      defaultCityIds,
    ) as Array<Id<'cities'>>
    const nearbyBuilderCityIds = getNearbyBuilderCityIds({
      scope: deps.scope,
      selectedCityIds,
    }) as Array<Id<'cities'>>

    await Promise.all([
      deps.mode === 'projects'
        ? context.queryClient.ensureQueryData(
            exploreFeedQueryOptions({
              scope: deps.scope,
              selectedCityIds,
            }),
          )
        : Promise.resolve(),
      deps.mode === 'builders'
        ? context.queryClient.ensureQueryData(
            nearbyBuildersQueryOptions(nearbyBuilderCityIds),
          )
        : Promise.resolve(),
      context.queryClient.ensureQueryData(
        followingQueryOptions(explorePrefs.viewerId),
      ),
      selectedCityIds.length > 0
        ? context.queryClient.ensureQueryData(
            citiesByIdsQueryOptions(selectedCityIds),
          )
        : Promise.resolve(),
    ])
  },
  pendingComponent: FeedRoutePending,
  pendingMs: ROUTE_PENDING_MS,
  pendingMinMs: ROUTE_PENDING_MIN_MS,
  component: ExplorePage,
})

function ExplorePage() {
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()
  const search = Route.useSearch()
  const { data: explorePrefsData } = useSuspenseQuery(
    viewerExplorePrefsQueryOptions(),
  )
  const { data: viewerStateData } = useSuspenseQuery(
    viewerLikedProjectIdsQueryOptions(),
  )
  const explorePrefs = mapViewerExplorePrefs(
    explorePrefsData as ViewerExplorePrefsPayload | undefined,
  )
  const viewerState = mapViewerLikedProjectIds(
    viewerStateData as ViewerLikedProjectIdsPayload | undefined,
  )
  const defaultCityIds = deriveDefaultExploreCityIds(explorePrefs)
  const effectiveSelectedCityIds = getExploreProjectCityIds(
    search,
    defaultCityIds,
  )
  const selectedCityIds = effectiveSelectedCityIds as Array<Id<'cities'>>
  const viewerId = explorePrefs?.viewerId
  const currentScope = search.scope
  const currentMode = search.mode
  const isGlobalFeed = isExploreProjectFeedGlobal(currentScope)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [dismissedPostIds, setDismissedPostIds] = useState<Set<string>>(
    new Set(),
  )
  const [projectLimit, setProjectLimit] = useState(EXPLORE_INITIAL_LIMIT)
  const [postLimit, setPostLimit] = useState(EXPLORE_INITIAL_LIMIT)
  const [pendingLikes, setPendingLikes] = useState<Set<string>>(new Set())
  const [pendingFollows, setPendingFollows] = useState<Set<string>>(new Set())
  const [resetPending, setResetPending] = useState(false)
  const [followOverrides, setFollowOverrides] = useState<
    Record<string, boolean>
  >({})
  const [pendingCityIds, setPendingCityIds] = useState(false)
  const [selectedCityLabels, setSelectedCityLabels] = useState<
    Record<string, string>
  >({})
  const [cityQuery, setCityQuery] = useState('')
  const commitSearchQuery = useCallback(
    (q: string) => {
      void navigate({
        to: '/explore',
        search: (current) => ({
          ...current,
          q,
        }),
        replace: true,
        resetScroll: false,
      })
    },
    [navigate],
  )
  const {
    debouncedSearchQuery,
    localSearchQuery,
    resetSearchQuery,
    setLocalSearchQuery,
  } = useDebouncedRouteSearch({
    onCommit: commitSearchQuery,
    routeQuery: search.q,
  })
  const isBuilderSearchActive =
    currentMode === 'builders' && debouncedSearchQuery.length > 0
  const isProjectSearchActive =
    currentMode === 'projects' && debouncedSearchQuery.length > 0
  const isPostSearchActive =
    currentMode === 'posts' && debouncedSearchQuery.length > 0
  const isPostBrowseActive =
    currentMode === 'posts' && debouncedSearchQuery.length === 0

  const selectedCitiesQuery = useQuery({
    ...citiesByIdsQueryOptions(selectedCityIds),
    enabled: selectedCityIds.length > 0,
  })
  const selectedCities =
    (selectedCitiesQuery.data as Array<Doc<'cities'>> | undefined) ?? []
  const canonicalSelectedCityIds = getCanonicalExploreCityIds(
    effectiveSelectedCityIds,
    selectedCities,
  )
  const queryCityIds = canonicalSelectedCityIds as Array<Id<'cities'>>
  const queryCityKey = queryCityIds.map(String).join('|')
  const nearbyBuilderCityIds = getNearbyBuilderCityIds({
    scope: currentScope,
    selectedCityIds: canonicalSelectedCityIds,
  }) as Array<Id<'cities'>>

  const scopedFeedQuery = useQuery({
    ...exploreFeedQueryOptions({
      limit: projectLimit,
      scope: currentScope,
      selectedCityIds: queryCityIds,
    }),
    enabled: currentMode === 'projects',
    placeholderData: keepPreviousExploreFeedData({
      currentScope,
      currentSelectedCityIds: queryCityIds,
    }),
  })
  const nearbyBuildersQuery = useQuery({
    ...nearbyBuildersQueryOptions(nearbyBuilderCityIds),
    enabled: currentMode === 'builders' && !isBuilderSearchActive,
  })
  const { data: followingData } = useSuspenseQuery(
    followingQueryOptions(viewerId as Id<'users'>),
  )

  const likeProject = useLikeProject()
  const unlikeProject = useUnlikeProject()
  const followUser = useFollowUser()
  const unfollowUser = useUnfollowUser()
  const dismissProject = useDismissExploreProject()
  const dismissPost = useDismissExplorePost()
  const resetProjects = useResetExploreProjects()
  const resetPosts = useResetExplorePosts()
  const { openConversation, pendingUserId } = useOpenConversation()

  const citySearchResultsQuery = useQuery({
    ...citiesSearchQueryOptions(cityQuery.trim() || 'unused'),
    enabled: cityQuery.trim().length > 0,
  })
  const builderSearchQuery = useQuery(
    currentMode === 'builders' && debouncedSearchQuery.length > 0
      ? builderSearchQueryOptions({
          cityIds: queryCityIds,
          q: debouncedSearchQuery,
        })
      : disabledQuery(
          builderSearchQueryOptions({
            cityIds: [],
            q: '',
          }),
        ),
  )
  const projectSearchQuery = useQuery(
    isProjectSearchActive
      ? projectSearchQueryOptions({
          cityIds: queryCityIds,
          q: debouncedSearchQuery,
        })
      : disabledQuery(
          projectSearchQueryOptions({
            cityIds: [],
            q: '',
          }),
        ),
  )
  const postSearchQuery = useQuery(
    isPostSearchActive
      ? {
          ...postSearchQueryOptions({
            cityIds: queryCityIds,
            limit: postLimit,
            q: debouncedSearchQuery,
          }),
          placeholderData: keepPreviousPostSearchData({
            currentCityIds: queryCityIds,
            currentQuery: debouncedSearchQuery,
          }),
        }
      : disabledQuery(
          postSearchQueryOptions({
            cityIds: [],
            q: '',
          }),
        ),
  )
  const postListQuery = useQuery(
    isPostBrowseActive
      ? {
          ...postListQueryOptions({
            limit: postLimit,
            scope: currentScope,
            selectedCityIds: queryCityIds,
          }),
          placeholderData: keepPreviousPostListData({
            currentScope,
            currentSelectedCityIds: queryCityIds,
          }),
        }
      : disabledQuery(
          postListQueryOptions({
            scope: 'global',
            selectedCityIds: [],
          }),
        ),
  )
  const feedQueryKey = exploreFeedQueryOptions({
    limit: projectLimit,
    scope: currentScope,
    selectedCityIds: queryCityIds,
  }).queryKey
  const postListQueryKey = postListQueryOptions({
    limit: postLimit,
    scope: currentScope,
    selectedCityIds: queryCityIds,
  }).queryKey
  const postSearchQueryKey = postSearchQueryOptions({
    cityIds: queryCityIds,
    limit: postLimit,
    q: debouncedSearchQuery,
  }).queryKey
  const nearbyBuildersQueryKey =
    nearbyBuildersQueryOptions(nearbyBuilderCityIds).queryKey
  const followingQueryKey = followingQueryOptions(
    viewerId as Id<'users'>,
  ).queryKey
  const likedProjectIdsQueryKey = viewerLikedProjectIdsQueryOptions().queryKey
  const likeMutation = useMutation({
    mutationFn: async ({
      currentlyLiked,
      projectId,
    }: {
      currentlyLiked: boolean
      projectId: Id<'projects'>
    }) =>
      currentlyLiked
        ? unlikeProject({ projectId })
        : likeProject({ projectId }),
    onMutate: async ({ currentlyLiked, projectId }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: feedQueryKey }),
        queryClient.cancelQueries({ queryKey: likedProjectIdsQueryKey }),
      ])

      const previousFeed =
        queryClient.getQueryData<ExploreFeedPayload>(feedQueryKey)
      const previousLikedProjectIds =
        queryClient.getQueryData<ViewerLikedProjectIdsPayload>(
          likedProjectIdsQueryKey,
        )

      queryClient.setQueryData(
        feedQueryKey,
        (current: ExploreFeedPayload | undefined) =>
          updateExploreFeedPayload(
            current,
            projectId,
            currentlyLiked,
            !currentlyLiked,
          ),
      )
      queryClient.setQueryData(
        likedProjectIdsQueryKey,
        (current: ViewerLikedProjectIdsPayload | undefined) =>
          updateLikedProjectIdsPayload(current, projectId, !currentlyLiked),
      )

      return { previousFeed, previousLikedProjectIds }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(feedQueryKey, context?.previousFeed)
      queryClient.setQueryData(
        likedProjectIdsQueryKey,
        context?.previousLikedProjectIds,
      )
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: feedQueryKey }),
        queryClient.invalidateQueries({ queryKey: likedProjectIdsQueryKey }),
      ])
    },
  })

  useEffect(() => {
    setProjectLimit(EXPLORE_INITIAL_LIMIT)
    setDismissedIds(new Set())
  }, [currentScope, queryCityKey, isProjectSearchActive])

  useEffect(() => {
    setPostLimit(EXPLORE_INITIAL_LIMIT)
    setDismissedPostIds(new Set())
  }, [debouncedSearchQuery, queryCityKey])

  useEffect(() => {
    if (selectedCities.length === 0) {
      return
    }

    setSelectedCityLabels((current) => {
      const next = { ...current }
      for (const city of selectedCities) {
        next[String(city._id)] = city.displayName
      }
      return next
    })
  }, [selectedCities])

  useEffect(() => {
    if (
      defaultCityIds.length === 1 &&
      explorePrefs?.cityName &&
      !selectedCityLabels[defaultCityIds[0] ?? '']
    ) {
      setSelectedCityLabels((current) => ({
        ...current,
        [defaultCityIds[0] ?? '']: explorePrefs.cityName ?? 'selected city',
      }))
    }
  }, [defaultCityIds, explorePrefs?.cityName, selectedCityLabels])

  const likedProjectIds = new Set(
    viewerState?.likedProjectIds.map(String) ?? [],
  )
  const followedUserIds = new Set(
    ((followingData as Array<Doc<'follows'>> | undefined) ?? []).map((follow) =>
      String(follow.followingId),
    ),
  )
  const scopedFeedData = scopedFeedQuery.data as ExploreFeedPayload | undefined
  const projects = scopedFeedData?.projects ?? []
  const items = projects
  const nearbyBuilders =
    (nearbyBuildersQuery.data as Array<BuilderPreview> | undefined) ?? []
  const builderResults = isBuilderSearchActive
    ? ((builderSearchQuery.data as Array<BuilderPreview> | undefined) ?? [])
    : nearbyBuilders
  const projectSearchData = projectSearchQuery.data as
    | {
        projectResultScope: 'recent'
        projects: ExploreFeedPayload['projects']
      }
    | undefined
  const postSearchData = postSearchQuery.data as
    | {
        posts: Array<Doc<'posts'>>
        hasMore: boolean
      }
    | undefined
  const postListData = postListQuery.data as
    | {
        posts: Array<Doc<'posts'>>
        hasMore: boolean
      }
    | undefined
  const activePostData = isPostSearchActive ? postSearchData : postListData
  const postResults = activePostData?.posts ?? []
  const displayedItems = isProjectSearchActive
    ? (projectSearchData?.projects ?? [])
    : items
  const hasMoreProjects =
    !isProjectSearchActive &&
    displayedItems.length >= projectLimit &&
    projectLimit < EXPLORE_MAX_LIMIT
  const hasMorePosts =
    currentMode === 'posts' &&
    Boolean(activePostData?.hasMore) &&
    postLimit < EXPLORE_MAX_LIMIT
  const canonicalSelectedCities = dedupeExploreCities(selectedCities)
  const selectedCityIdentities = new Set(
    canonicalSelectedCities.map(getExploreCityIdentity),
  )
  const selectedCityLabelById = new Map(
    canonicalSelectedCities.map((city) => [String(city._id), city.displayName]),
  )

  const selectedCityChips = canonicalSelectedCityIds.map((cityId: string) => ({
    id: cityId,
    name:
      selectedCityLabelById.get(cityId) ??
      selectedCityLabels[cityId] ??
      'loading city…',
  }))

  const cityResults =
    cityQuery.trim().length > 0
      ? ((citySearchResultsQuery.data as Array<Doc<'cities'>> | undefined) ??
        [])
      : []
  const availableCities = dedupeExploreCities(cityResults).filter(
    (city: Doc<'cities'>) =>
      !canonicalSelectedCityIds.includes(String(city._id)) &&
      !selectedCityIdentities.has(getExploreCityIdentity(city)),
  )
  const updateSearch = useCallback(
    (next: Partial<typeof search>) => {
      void navigate({
        to: '/explore',
        search: (current) => ({
          ...current,
          ...next,
        }),
        replace: true,
        resetScroll: false,
      })
    },
    [navigate],
  )

  const updateExploreMode = (mode: typeof currentMode) => {
    resetSearchQuery()

    void navigate({
      to: '/explore',
      search: (current) => ({
        ...current,
        mode,
        q: '',
      }),
      replace: true,
      resetScroll: false,
    })
  }

  useEffect(() => {
    if (currentScope !== 'custom' || selectedCities.length === 0) {
      return
    }

    const canonicalRouteCityIds = getCanonicalExploreCityIds(
      search.selectedCityIds,
      selectedCities,
    )
    if (areExploreCityIdsEqual(search.selectedCityIds, canonicalRouteCityIds)) {
      return
    }

    updateSearch({
      scope: canonicalRouteCityIds.length > 0 ? 'custom' : 'global',
      selectedCityIds: canonicalRouteCityIds,
    })
  }, [currentScope, search.selectedCityIds, selectedCities, updateSearch])

  const persistCityIds = async (
    nextCityIds: Array<string | Id<'cities'>>,
    nextCities: Array<Doc<'cities'>> = selectedCities,
  ) => {
    if (!explorePrefs) {
      return
    }

    const nextCityIdStrings = getCanonicalExploreCityIds(
      nextCityIds.map((cityId) => String(cityId)),
      nextCities,
    )
    const nextScope = nextCityIdStrings.length > 0 ? 'custom' : 'global'

    setPendingCityIds(true)

    try {
      updateSearch({
        scope: nextScope,
        selectedCityIds: nextCityIdStrings,
      })
      setCityQuery('')
    } catch (error) {
      console.error('Failed to update city filters', error)
    } finally {
      setPendingCityIds(false)
    }
  }

  const handleDismiss = async (
    projectId: Id<'projects'>,
    projectKey: string,
  ) => {
    setDismissedIds((current) => new Set(current).add(projectKey))

    try {
      await dismissProject({ projectId })
    } catch (error) {
      console.error('Dismiss failed', error)
      setDismissedIds((current) => {
        const next = new Set(current)
        next.delete(projectKey)
        return next
      })
    }
  }

  const handleDismissPost = async (postId: Id<'posts'>, postKey: string) => {
    setDismissedPostIds((current) => new Set(current).add(postKey))

    try {
      await dismissPost({ postId })
    } catch (error) {
      console.error('Post dismiss failed', error)
      setDismissedPostIds((current) => {
        const next = new Set(current)
        next.delete(postKey)
        return next
      })
    }
  }

  const handleResetExplore = async () => {
    if (resetPending) return

    setResetPending(true)
    try {
      if (currentMode === 'posts') {
        await resetPosts({})
        setDismissedPostIds(new Set())
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: postListQueryKey }),
          queryClient.invalidateQueries({ queryKey: postSearchQueryKey }),
        ])
        return
      }

      if (currentMode === 'projects') {
        await resetProjects({})
        setDismissedIds(new Set())
        await queryClient.invalidateQueries({ queryKey: feedQueryKey })
      }
    } catch (error) {
      console.error('Explore reset failed', error)
    } finally {
      setResetPending(false)
    }
  }

  const handleLike = async (projectId: Id<'projects'>, projectKey: string) => {
    if (pendingLikes.has(projectKey)) return
    setPendingLikes((current) => new Set(current).add(projectKey))

    try {
      const currentLikedProjectIds =
        queryClient.getQueryData<ViewerLikedProjectIdsPayload>(
          likedProjectIdsQueryKey,
        )
      await likeMutation.mutateAsync({
        currentlyLiked: Boolean(
          currentLikedProjectIds?.likedProjectIds
            .map(String)
            .includes(projectKey) ?? likedProjectIds.has(projectKey),
        ),
        projectId,
      })
    } catch (error) {
      console.error('Like failed', error)
    } finally {
      setPendingLikes((current) => {
        const next = new Set(current)
        next.delete(projectKey)
        return next
      })
    }
  }

  const handleFollow = async (
    userId: Id<'users'>,
    userKey: string,
    currentlyFollowed: boolean,
  ) => {
    if (pendingFollows.has(userKey)) return
    setPendingFollows((current) => new Set(current).add(userKey))
    setFollowOverrides((current) => ({
      ...current,
      [userKey]: !currentlyFollowed,
    }))

    try {
      if (currentlyFollowed) {
        await unfollowUser({ targetUserId: userId })
      } else {
        await followUser({ targetUserId: userId })
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: followingQueryKey }),
        queryClient.invalidateQueries({ queryKey: feedQueryKey }),
        queryClient.invalidateQueries({ queryKey: nearbyBuildersQueryKey }),
      ])
    } catch (error) {
      console.error('Follow failed', error)
      setFollowOverrides((current) => ({
        ...current,
        [userKey]: currentlyFollowed,
      }))
    } finally {
      setPendingFollows((current) => {
        const next = new Set(current)
        next.delete(userKey)
        return next
      })
    }
  }

  const removeCityById = (cityId: string) =>
    void persistCityIds(
      removeExploreCityId({
        cities: selectedCities,
        cityId,
        cityIds: effectiveSelectedCityIds,
      }),
      selectedCities,
    )

  return (
    <div className="lx-page-shell">
      <ExploreHeader
        availableCities={availableCities}
        cityQuery={cityQuery}
        currentScope={currentScope}
        mode={currentMode}
        onCityQueryChange={setCityQuery}
        onModeChange={updateExploreMode}
        onRemoveCity={removeCityById}
        onResetExplore={handleResetExplore}
        onSelectCity={(city) =>
          void persistCityIds(
            [...queryCityIds, city._id],
            [...selectedCities, city],
          )
        }
        onSearchQueryChange={setLocalSearchQuery}
        pendingCityIds={pendingCityIds}
        resetPending={resetPending}
        searchQuery={localSearchQuery}
        searchStatusActive={debouncedSearchQuery.length > 0}
        selectedCityChips={selectedCityChips}
      />

      <div className="lx-page-scroll" data-scroll-restoration-id="explore-feed">
        <div className="lx-page-width-detail min-w-0">
          <ExploreFeed
            builderResults={builderResults}
            builderSearchLoading={builderSearchQuery.isLoading}
            debouncedSearchQuery={debouncedSearchQuery}
            dismissedIds={dismissedIds}
            dismissedPostIds={dismissedPostIds}
            followOverrides={followOverrides}
            followedUserIds={followedUserIds}
            hasMoreProjects={hasMoreProjects}
            hasMorePosts={hasMorePosts}
            isBuilderSearchActive={isBuilderSearchActive}
            isBuildersMode={currentMode === 'builders'}
            isGlobalFeed={isGlobalFeed}
            isPostSearchActive={isPostSearchActive}
            isPostsMode={currentMode === 'posts'}
            isProjectSearchActive={isProjectSearchActive}
            items={displayedItems}
            likedProjectIds={likedProjectIds}
            loadMorePending={
              scopedFeedQuery.isFetching ||
              postListQuery.isFetching ||
              postSearchQuery.isFetching
            }
            onDismissPost={handleDismissPost}
            onDismissProject={handleDismiss}
            onFollowUser={handleFollow}
            onLikeProject={handleLike}
            onLoadMorePosts={() =>
              setPostLimit((current) =>
                Math.min(current + EXPLORE_LIMIT_STEP, EXPLORE_MAX_LIMIT),
              )
            }
            onLoadMoreProjects={() =>
              setProjectLimit((current) =>
                Math.min(current + EXPLORE_LIMIT_STEP, EXPLORE_MAX_LIMIT),
              )
            }
            onMessageUser={(userId) => void openConversation(userId)}
            onOpenBuilderProfile={(builder) =>
              void navigate({
                to: '/u/$username',
                params: {
                  username: builder.githubUsername,
                },
                search: { tab: 'projects' },
              })
            }
            pendingFollows={pendingFollows}
            pendingLikes={pendingLikes}
            pendingUserId={pendingUserId}
            projectFeedLoading={
              scopedFeedQuery.isLoading ||
              (scopedFeedQuery.isFetching && !scopedFeedQuery.isPlaceholderData)
            }
            projectSearchLoading={
              projectSearchQuery.isLoading || projectSearchQuery.isFetching
            }
            postSearchLoading={
              isPostSearchActive
                ? postSearchQuery.isLoading ||
                  (postSearchQuery.isFetching &&
                    !postSearchQuery.isPlaceholderData)
                : postListQuery.isLoading ||
                  (postListQuery.isFetching && !postListQuery.isPlaceholderData)
            }
            postResults={postResults}
            viewerId={viewerId}
          />
        </div>
      </div>
    </div>
  )
}
