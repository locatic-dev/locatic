import { createFileRoute } from '@tanstack/react-router'
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { usePaginatedQuery } from 'convex/react'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import {
  builderSearchQueryOptions,
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
  writeStoredExploreSearch,
} from '@/features/explore/state'
import { ExploreHeader } from '@/features/explore/components/explore-header'
import { ExploreFeed } from '@/features/explore/components/explore-feed'
import { keepPreviousPostSearchData } from '@/features/explore/query-transitions'
import {
  getPostSearchLoadMoreAction,
  getPostSearchResetKey,
  getNextPostSearchLimit,
  POST_SEARCH_LOAD_MORE_ACTIONS,
  POST_SEARCH_DEFAULT_LIMIT,
} from '@/features/explore/post-search'
import { useDebouncedRouteSearch } from '@/features/explore/use-debounced-route-search'
import { shouldPrefetchPrivateConvexQueries } from '@/lib/auth-routing'
import type {
  BuilderPreview,
  ExploreProjectPreview,
} from '@/features/explore/types'

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

    await Promise.all([
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
  const selectedCityIdsStorageKey = JSON.stringify(selectedCityIds)
  const viewerId = explorePrefs?.viewerId
  const currentScope = search.scope
  const currentMode = search.mode
  const isGlobalFeed = isExploreProjectFeedGlobal(currentScope)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [dismissedPostIds, setDismissedPostIds] = useState<Set<string>>(
    new Set(),
  )
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
  const [postSearchLimit, setPostSearchLimit] = useState(
    POST_SEARCH_DEFAULT_LIMIT,
  )
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

  useEffect(() => {
    writeStoredExploreSearch({
      mode: currentMode,
      q: search.q,
      scope: currentScope,
      selectedCityIds: JSON.parse(selectedCityIdsStorageKey) as string[],
    })
  }, [currentMode, currentScope, search.q, selectedCityIdsStorageKey])

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
  const postSearchResetKey = getPostSearchResetKey({
    cityIds: queryCityIds.map(String),
    mode: currentMode,
    query: debouncedSearchQuery,
  })
  const nearbyBuilderCityIds = getNearbyBuilderCityIds({
    scope: currentScope,
    selectedCityIds: canonicalSelectedCityIds,
  }) as Array<Id<'cities'>>

  const scopedFeedPaged = usePaginatedQuery(
    api.explore.list,
    currentMode === 'projects' && !isProjectSearchActive
      ? { scope: currentScope, selectedCityIds: queryCityIds }
      : 'skip',
    { initialNumItems: 20 },
  )
  const nearbyBuildersPaged = usePaginatedQuery(
    api.explore.listNearbyBuilders,
    currentMode === 'builders' && !isBuilderSearchActive
      ? { cityIds: nearbyBuilderCityIds }
      : 'skip',
    { initialNumItems: 20 },
  )
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
            limit: postSearchLimit,
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
  const postListPaged = usePaginatedQuery(
    api.explore.listPosts,
    isPostBrowseActive
      ? { scope: currentScope, selectedCityIds: queryCityIds }
      : 'skip',
    { initialNumItems: 20 },
  )
  const postSearchQueryKey = postSearchQueryOptions({
    cityIds: queryCityIds,
    limit: postSearchLimit,
    q: debouncedSearchQuery,
  }).queryKey
  const followingQueryKey = followingQueryOptions(
    viewerId as Id<'users'>,
  ).queryKey
  const likedProjectIdsQueryKey = viewerLikedProjectIdsQueryOptions().queryKey

  useEffect(() => {
    setPostSearchLimit(POST_SEARCH_DEFAULT_LIMIT)
  }, [postSearchResetKey])

  useEffect(() => {
    setDismissedIds(new Set())
  }, [currentScope, queryCityKey, isProjectSearchActive])

  useEffect(() => {
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
  const items =
    (scopedFeedPaged.results as Array<ExploreProjectPreview> | undefined) ?? []
  const nearbyBuilders = (nearbyBuildersPaged.results ??
    []) as Array<BuilderPreview>
  const builderResults = isBuilderSearchActive
    ? ((builderSearchQuery.data as Array<BuilderPreview> | undefined) ?? [])
    : nearbyBuilders
  const canLoadMoreBuilders =
    !isBuilderSearchActive && nearbyBuildersPaged.status === 'CanLoadMore'
  const isLoadingMoreBuilders =
    !isBuilderSearchActive && nearbyBuildersPaged.status === 'LoadingMore'
  const projectSearchData = projectSearchQuery.data as
    | {
        projectResultScope: 'recent'
        projects: Array<ExploreProjectPreview>
      }
    | undefined
  const postSearchData = postSearchQuery.data as
    | {
        posts: Array<Doc<'posts'>>
        hasMore: boolean
      }
    | undefined
  const postBrowseResults =
    (postListPaged.results as Array<Doc<'posts'>> | undefined) ?? []
  const postResults = isPostSearchActive
    ? (postSearchData?.posts ?? [])
    : postBrowseResults
  const displayedItems = isProjectSearchActive
    ? (projectSearchData?.projects ?? [])
    : items
  const hasMoreProjects =
    !isProjectSearchActive && scopedFeedPaged.status === 'CanLoadMore'
  const hasMorePosts =
    currentMode === 'posts' &&
    (isPostSearchActive
      ? Boolean(postSearchData?.hasMore)
      : postListPaged.status === 'CanLoadMore')
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
        await queryClient.invalidateQueries({ queryKey: postSearchQueryKey })
        return
      }

      if (currentMode === 'projects') {
        await resetProjects({})
        setDismissedIds(new Set())
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
      const currentlyLiked = Boolean(
        currentLikedProjectIds?.likedProjectIds
          .map(String)
          .includes(projectKey) ?? likedProjectIds.has(projectKey),
      )
      if (currentlyLiked) {
        await unlikeProject({ projectId })
      } else {
        await likeProject({ projectId })
      }
      await queryClient.invalidateQueries({ queryKey: likedProjectIdsQueryKey })
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
      await queryClient.invalidateQueries({ queryKey: followingQueryKey })
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
        <div className="lx-page-width-wide min-w-0">
          <ExploreFeed
            builderResults={builderResults}
            builderSearchLoading={builderSearchQuery.isLoading}
            canLoadMoreBuilders={canLoadMoreBuilders}
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
            isLoadingMoreBuilders={isLoadingMoreBuilders}
            isPostSearchActive={isPostSearchActive}
            isPostsMode={currentMode === 'posts'}
            isProjectSearchActive={isProjectSearchActive}
            items={displayedItems}
            likedProjectIds={likedProjectIds}
            loadMorePending={
              scopedFeedPaged.status === 'LoadingMore' ||
              postListPaged.status === 'LoadingMore' ||
              postSearchQuery.isFetching
            }
            onDismissPost={handleDismissPost}
            onDismissProject={handleDismiss}
            onFollowUser={handleFollow}
            onLikeProject={handleLike}
            onLoadMoreBuilders={() => nearbyBuildersPaged.loadMore(20)}
            onLoadMorePosts={() => {
              if (
                getPostSearchLoadMoreAction({ isPostSearchActive }) ===
                POST_SEARCH_LOAD_MORE_ACTIONS.growSearchLimit
              ) {
                setPostSearchLimit(getNextPostSearchLimit)
                return
              }

              postListPaged.loadMore(20)
            }}
            onLoadMoreProjects={() => scopedFeedPaged.loadMore(20)}
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
            projectFeedLoading={scopedFeedPaged.status === 'LoadingFirstPage'}
            projectSearchLoading={
              projectSearchQuery.isLoading || projectSearchQuery.isFetching
            }
            postSearchLoading={
              isPostSearchActive
                ? postSearchQuery.isLoading ||
                  (postSearchQuery.isFetching &&
                    !postSearchQuery.isPlaceholderData)
                : postListPaged.status === 'LoadingFirstPage'
            }
            postResults={postResults}
            viewerId={viewerId}
          />
        </div>
      </div>
    </div>
  )
}
