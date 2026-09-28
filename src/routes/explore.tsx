import {
  createFileRoute,
  redirect,
  useRouterState,
} from '@tanstack/react-router'
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
  type QueryKey,
} from '@tanstack/react-query'
import { usePaginatedQuery } from 'convex/react'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import {
  builderSearchQueryOptions,
  cityStatsQueryOptions,
  projectSearchQueryOptions,
  postSearchQueryOptions,
} from '@/features/explore/queries'
import { followingQueryOptions } from '@/features/follows/queries'
import {
  citiesByIdsQueryOptions,
  citiesSearchQueryOptions,
} from '@/features/cities/queries'
import { useFollowUser, useUnfollowUser } from '@/features/follows/mutations'
import {
  useDismissExplorePost,
  useDismissExploreProject,
  useResetExplorePosts,
  useResetExploreProjects,
} from '@/features/explore/mutations'
import { useOpenConversation } from '@/features/inbox/use-open-conversation'
import { reportActionError } from '@/lib/action-error'
import { showUndoToast } from '@/lib/undo-toast'
import { useSignInReturnHref } from '@/lib/return-href'
import { toSafeRelativeUrl } from '@/lib/safe-redirect'
import { MemberShell } from '@/components/app-shell/member-shell'
import { PublicHeader } from '@/components/app-shell/public-header'
import {
  FeedRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '@/components/app-shell/route-pending'
import {
  mapViewerExplorePrefs,
  mapViewerLikedProjectIds,
  type ViewerBootstrapPayload,
  type ViewerExplorePrefsPayload,
  type ViewerLikedProjectIdsPayload,
} from '@/features/contracts'
import {
  viewerExplorePrefsQueryOptions,
  viewerLikedProjectIdsQueryOptions,
  viewerQueryOptions,
} from '@/features/viewer/queries'
import {
  areExploreCityIdsEqual,
  dedupeExploreCities,
  deriveDefaultExploreCityIds,
  describeExploreFilters,
  getCanonicalExploreCityIds,
  getExploreTextQuery,
  getExploreCityIdentity,
  getExploreLoaderDeps,
  getExploreModeFilters,
  getExploreOrderingCopy,
  getExploreProjectCityIds,
  getExploreResultSetKey,
  getNearbyBuilderCityIds,
  isExploreProjectFeedGlobal,
  normalizeExploreSearch,
  removeExploreCityId,
  writeStoredExploreSearch,
  type ExploreFilters,
} from '@/features/explore/state'
import {
  EXPLORE_CITY_INPUT_ID,
  ExploreHeader,
} from '@/features/explore/components/explore-header'
import {
  ExploreFeed,
  type ExploreEmptyCity,
} from '@/features/explore/components/explore-feed'
import { keepPreviousPostSearchData } from '@/features/explore/query-transitions'
import {
  getPostSearchLoadMoreAction,
  getPostSearchResetKey,
  getNextPostSearchLimit,
  POST_SEARCH_LOAD_MORE_ACTIONS,
  POST_SEARCH_DEFAULT_LIMIT,
} from '@/features/explore/post-search'
import { EXPLORE_PAGINATED_PAGE_SIZE } from '@/features/explore/pagination'
import { useDebouncedRouteSearch } from '@/features/explore/use-debounced-route-search'
import { useExploreFeedPagination } from '@/features/explore/use-explore-feed-pagination'
import {
  getExploreSearchPhase,
  type ExploreFeedState,
} from '@/features/explore/feed-state'
import { shouldPrefetchPrivateConvexQueries } from '@/lib/auth-routing'
import type {
  BuilderPreview,
  ExplorePostPreview,
  ExploreProjectPreview,
} from '@/features/explore/types'

/**
 * Explore is public (plan item C1). Signed-in members get the app shell and
 * their personal feed; signed-out visitors get the public header and the
 * public queries, and are never sent through sign-in (A6). Members who still
 * need onboarding go there first with this URL as the destination, as the
 * `_app` guard does for every other member route.
 */
export const Route = createFileRoute('/explore')({
  validateSearch: normalizeExploreSearch,
  loaderDeps: ({ search }) => getExploreLoaderDeps(search),
  beforeLoad: async ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      return
    }

    const bootstrap = (await context.queryClient.ensureQueryData(
      viewerQueryOptions(),
    )) as ViewerBootstrapPayload

    if (bootstrap.needsOnboarding) {
      throw redirect({
        to: '/onboarding',
        search: { redirect: toSafeRelativeUrl(location.href) ?? undefined },
      })
    }
  },
  loader: async ({ context, deps }) => {
    if (!shouldPrefetchPrivateConvexQueries()) {
      return
    }

    if (!context.auth.isAuthenticated) {
      // Visitors have no default cities, so only explicit ones are named.
      const selectedCityIds = getExploreProjectCityIds(deps, []) as Array<
        Id<'cities'>
      >
      if (selectedCityIds.length > 0) {
        await context.queryClient.ensureQueryData(
          citiesByIdsQueryOptions(selectedCityIds),
        )
      }
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
  component: ExploreRoute,
})

/** Rows a local-builders list under an empty city shows (one bounded page). */
const EMPTY_CITY_BUILDER_LIMIT = 5

function ExploreRoute() {
  const { auth } = Route.useRouteContext()
  return auth.isAuthenticated ? <MemberExplore /> : <VisitorExplore />
}

/**
 * The member app shell around Explore, as `_app` renders it for member
 * routes. A session without a viewer record falls back to public Explore.
 */
function MemberExplore() {
  return (
    <MemberShell withoutViewer={<VisitorExplore />}>
      <ViewerExplorePage />
    </MemberShell>
  )
}

/** Public Explore: public header with sign-up, read-only feeds. */
function VisitorExplore() {
  return (
    <div className="min-h-dvh bg-canvas">
      <PublicHeader />
      <main id="main-content" tabIndex={-1} className="lx-page-shell">
        <ExploreView viewer={null} />
      </main>
    </div>
  )
}

type ExploreViewer = {
  explorePrefs: ReturnType<typeof mapViewerExplorePrefs>
  followedUserIds: Set<string>
  followingQueryKey: QueryKey
  likedProjectIds: Set<string>
  viewerId: Id<'users'> | undefined
}

function ViewerExplorePage() {
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
  const viewerId = explorePrefs?.viewerId
  const { data: followingData } = useSuspenseQuery(
    followingQueryOptions(viewerId as Id<'users'>),
  )

  return (
    <ExploreView
      viewer={{
        explorePrefs,
        followedUserIds: new Set(
          ((followingData as Array<Doc<'follows'>> | undefined) ?? []).map(
            (follow) => String(follow.followingId),
          ),
        ),
        followingQueryKey: followingQueryOptions(viewerId as Id<'users'>)
          .queryKey,
        likedProjectIds: new Set(
          viewerState?.likedProjectIds.map(String) ?? [],
        ),
        viewerId,
      }}
    />
  )
}

/**
 * Explore for a member (`viewer`) or a signed-out visitor (`viewer: null`).
 * Visitors read the public queries, keep no stored scope and see sign-in
 * links in place of personal actions.
 */
function ExploreView({ viewer }: { viewer: ExploreViewer | null }) {
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()
  const search = Route.useSearch()
  const signInRedirect = useSignInReturnHref(
    useRouterState({ select: (state) => state.location.href }),
  )
  const isVisitor = viewer === null
  const explorePrefs = viewer?.explorePrefs ?? null
  const defaultCityIds = deriveDefaultExploreCityIds(explorePrefs)
  const effectiveSelectedCityIds = getExploreProjectCityIds(
    search,
    defaultCityIds,
  )
  const selectedCityIds = effectiveSelectedCityIds as Array<Id<'cities'>>
  const selectedCityIdsStorageKey = JSON.stringify(selectedCityIds)
  const viewerId = viewer?.viewerId
  const currentScope = search.scope
  const currentMode = search.mode
  // URL filters that apply to this mode (D2 language/topic, D3 collab).
  const modeFilters = getExploreModeFilters(search, currentMode)
  const hasModeFilters = Object.keys(modeFilters).length > 0
  const isGlobalFeed = isExploreProjectFeedGlobal(currentScope)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [dismissedPostIds, setDismissedPostIds] = useState<Set<string>>(
    new Set(),
  )
  const [pendingFollows, setPendingFollows] = useState<Set<string>>(new Set())
  const [resetPending, setResetPending] = useState(false)
  const [followOverrides, setFollowOverrides] = useState<
    Record<string, boolean>
  >({})
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
    routeQuery: getExploreTextQuery(search, isVisitor),
  })
  const isBuilderSearchActive =
    currentMode === 'builders' && debouncedSearchQuery.length > 0
  const isProjectSearchActive =
    currentMode === 'projects' && debouncedSearchQuery.length > 0
  const isPostSearchActive =
    currentMode === 'posts' && debouncedSearchQuery.length > 0
  const isPostBrowseActive =
    currentMode === 'posts' && debouncedSearchQuery.length === 0

  // Only members get a stored scope for the shell's Explore link (I5);
  // public Explore keeps its state in the URL alone.
  useEffect(() => {
    if (isVisitor) return
    writeStoredExploreSearch({
      mode: currentMode,
      q: search.q,
      scope: currentScope,
      selectedCityIds: JSON.parse(selectedCityIdsStorageKey) as string[],
      language: search.language,
      topic: search.topic,
      openToCollab: search.openToCollab,
    })
  }, [
    currentMode,
    currentScope,
    isVisitor,
    search.language,
    search.openToCollab,
    search.q,
    search.topic,
    selectedCityIdsStorageKey,
  ])

  const selectedCitiesQuery = useQuery(citiesByIdsQueryOptions(selectedCityIds))
  const selectedCities =
    (selectedCitiesQuery.data as Array<Doc<'cities'>> | undefined) ?? []
  // Once the lookup has answered (or failed), ids that named no city are
  // dropped rather than shown as a city that is forever loading.
  const selectedCitiesResolved =
    selectedCitiesQuery.data !== undefined || selectedCitiesQuery.isError
  const canonicalSelectedCityIds = getCanonicalExploreCityIds(
    effectiveSelectedCityIds,
    selectedCities,
    { dropUnresolved: selectedCitiesResolved },
  )
  const queryCityIds = canonicalSelectedCityIds as Array<Id<'cities'>>
  const queryCityKey = queryCityIds.map(String).join('|')
  const entranceKey = getExploreResultSetKey({
    cityIds: queryCityIds.map(String),
    filters: modeFilters,
    mode: currentMode,
    query: debouncedSearchQuery,
    scope: currentScope,
  })
  const postSearchResetKey = getPostSearchResetKey({
    cityIds: queryCityIds.map(String),
    mode: currentMode,
    query: debouncedSearchQuery,
  })
  const nearbyBuilderCityIds = getNearbyBuilderCityIds({
    scope: currentScope,
    selectedCityIds: canonicalSelectedCityIds,
  }) as Array<Id<'cities'>>

  // Members read their personal feeds, visitors the public ones (C1); the
  // unused query of each pair is skipped.
  const projectFeedArgs =
    currentMode === 'projects' && !isProjectSearchActive
      ? {
          scope: currentScope,
          selectedCityIds: queryCityIds,
          ...(modeFilters.language ? { language: modeFilters.language } : {}),
          ...(modeFilters.topic ? { topic: modeFilters.topic } : {}),
        }
      : 'skip'
  const viewerProjectsPaged = usePaginatedQuery(
    api.explore.list,
    isVisitor ? 'skip' : projectFeedArgs,
    { initialNumItems: EXPLORE_PAGINATED_PAGE_SIZE },
  )
  const publicProjectsPaged = usePaginatedQuery(
    api.explore.listPublic,
    isVisitor ? projectFeedArgs : 'skip',
    { initialNumItems: EXPLORE_PAGINATED_PAGE_SIZE },
  )
  const scopedFeedPaged = isVisitor ? publicProjectsPaged : viewerProjectsPaged
  const builderFeedArgs =
    currentMode === 'builders' && !isBuilderSearchActive
      ? {
          cityIds: nearbyBuilderCityIds,
          ...(modeFilters.openToCollab ? { openToCollab: true } : {}),
        }
      : 'skip'
  const viewerBuildersPaged = usePaginatedQuery(
    api.explore.listNearbyBuilders,
    isVisitor ? 'skip' : builderFeedArgs,
    { initialNumItems: EXPLORE_PAGINATED_PAGE_SIZE },
  )
  const publicBuildersPaged = usePaginatedQuery(
    api.explore.listNearbyBuildersPublic,
    isVisitor ? builderFeedArgs : 'skip',
    { initialNumItems: EXPLORE_PAGINATED_PAGE_SIZE },
  )
  const nearbyBuildersPaged = isVisitor
    ? publicBuildersPaged
    : viewerBuildersPaged

  const followUser = useFollowUser()
  const unfollowUser = useUnfollowUser()
  const dismissProject = useDismissExploreProject()
  const dismissPost = useDismissExplorePost()
  const resetProjects = useResetExploreProjects()
  const resetPosts = useResetExplorePosts()
  const { openConversation, pendingUserId } = useOpenConversation()

  // Inactive searches build 'skip' options (an empty query), so they hold no
  // Convex subscription.
  const citySearchResultsQuery = useQuery(
    citiesSearchQueryOptions(cityQuery.trim()),
  )
  const builderSearchQuery = useQuery(
    builderSearchQueryOptions({
      cityIds: queryCityIds,
      openToCollab: modeFilters.openToCollab,
      q: isBuilderSearchActive ? debouncedSearchQuery : '',
    }),
  )
  const projectSearchQuery = useQuery(
    projectSearchQueryOptions({
      cityIds: queryCityIds,
      language: modeFilters.language,
      q: isProjectSearchActive ? debouncedSearchQuery : '',
      topic: modeFilters.topic,
    }),
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
      : postSearchQueryOptions({ q: '' }),
  )
  const postFeedArgs = isPostBrowseActive
    ? { scope: currentScope, selectedCityIds: queryCityIds }
    : 'skip'
  const viewerPostsPaged = usePaginatedQuery(
    api.explore.listPosts,
    isVisitor ? 'skip' : postFeedArgs,
    { initialNumItems: EXPLORE_PAGINATED_PAGE_SIZE },
  )
  const publicPostsPaged = usePaginatedQuery(
    api.explore.listPostsPublic,
    isVisitor ? postFeedArgs : 'skip',
    { initialNumItems: EXPLORE_PAGINATED_PAGE_SIZE },
  )
  const postListPaged = isVisitor ? publicPostsPaged : viewerPostsPaged
  const postSearchQueryKey = postSearchQueryOptions({
    cityIds: queryCityIds,
    limit: postSearchLimit,
    q: debouncedSearchQuery,
  }).queryKey
  const followingQueryKey = viewer?.followingQueryKey

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

  const likedProjectIds = viewer?.likedProjectIds ?? new Set<string>()
  const followedUserIds = viewer?.followedUserIds ?? new Set<string>()
  const items = (
    (scopedFeedPaged.results as Array<ExploreProjectPreview> | undefined) ?? []
  ).filter((item) => !dismissedIds.has(String(item.projectId)))
  const projectSearchData = projectSearchQuery.data as
    | {
        projectResultScope: 'recent'
        projects: Array<ExploreProjectPreview>
      }
    | undefined
  const postSearchData = postSearchQuery.data as
    | {
        posts: Array<ExplorePostPreview>
        hasMore: boolean
      }
    | undefined
  const isNotDismissedPost = (post: ExplorePostPreview) =>
    !dismissedPostIds.has(String(post._id))
  const postBrowseResults = (
    (postListPaged.results as Array<ExplorePostPreview> | undefined) ?? []
  ).filter(isNotDismissedPost)

  const projectFeed = useExploreFeedPagination({
    enabled: currentMode === 'projects' && !isProjectSearchActive,
    paged: scopedFeedPaged,
    resetKey: entranceKey,
    visibleItems: items,
  })
  const builderFeed = useExploreFeedPagination({
    enabled: currentMode === 'builders' && !isBuilderSearchActive,
    paged: nearbyBuildersPaged,
    resetKey: entranceKey,
    visibleItems: nearbyBuildersPaged.results,
  })
  const postFeed = useExploreFeedPagination({
    enabled: isPostBrowseActive,
    paged: postListPaged,
    resetKey: entranceKey,
    visibleItems: postBrowseResults,
  })

  const feedScope = isGlobalFeed ? ('global' as const) : ('cities' as const)
  const getFeedState = (): ExploreFeedState => {
    switch (currentMode) {
      case 'builders':
        return isBuilderSearchActive
          ? {
              mode: 'builders',
              source: 'search',
              query: debouncedSearchQuery,
              ...getExploreSearchPhase({
                isError: builderSearchQuery.isError,
                isLoading: builderSearchQuery.isLoading,
                items: builderSearchQuery.data ?? [],
              }),
            }
          : {
              mode: 'builders',
              source: 'browse',
              scope: feedScope,
              ...builderFeed.phase,
            }
      case 'posts': {
        if (!isPostSearchActive) {
          return {
            mode: 'posts',
            source: 'browse',
            scope: feedScope,
            ...postFeed.phase,
          }
        }
        return {
          mode: 'posts',
          source: 'search',
          query: debouncedSearchQuery,
          ...getExploreSearchPhase({
            hasMore: Boolean(postSearchData?.hasMore),
            isError: postSearchQuery.isError,
            isLoading:
              postSearchQuery.isLoading ||
              (postSearchQuery.isFetching &&
                !postSearchQuery.isPlaceholderData),
            isLoadingMore: postSearchQuery.isFetching,
            items: (postSearchData?.posts ?? []).filter(isNotDismissedPost),
          }),
        }
      }
      case 'projects':
      default: {
        if (!isProjectSearchActive) {
          return {
            mode: 'projects',
            source: 'browse',
            scope: feedScope,
            ...projectFeed.phase,
          }
        }
        const searchItems = (projectSearchData?.projects ?? []).filter(
          (item) => !dismissedIds.has(String(item.projectId)),
        )
        return {
          mode: 'projects',
          source: 'search',
          query: debouncedSearchQuery,
          ...getExploreSearchPhase({
            isError: projectSearchQuery.isError,
            // Keep earlier matches on screen while a refetch runs.
            isLoading:
              searchItems.length === 0 &&
              (projectSearchQuery.isLoading || projectSearchQuery.isFetching),
            items: searchItems,
          }),
        }
      }
    }
  }
  const feedState = getFeedState()
  const handleLoadMore = () => {
    switch (currentMode) {
      case 'builders':
        builderFeed.loadMore()
        return
      case 'posts':
        if (
          getPostSearchLoadMoreAction({ isPostSearchActive }) ===
          POST_SEARCH_LOAD_MORE_ACTIONS.growSearchLimit
        ) {
          setPostSearchLimit(getNextPostSearchLimit)
          return
        }
        postFeed.loadMore()
        return
      case 'projects':
      default:
        projectFeed.loadMore()
    }
  }
  const canonicalSelectedCities = dedupeExploreCities(selectedCities)
  const selectedCityIdentities = new Set(
    canonicalSelectedCities.map(getExploreCityIdentity),
  )
  const selectedCityById = new Map(
    canonicalSelectedCities.map((city) => [String(city._id), city]),
  )

  const selectedCityChips = canonicalSelectedCityIds.map((cityId: string) => {
    const city = selectedCityById.get(cityId)
    return {
      id: cityId,
      name: city?.displayName ?? selectedCityLabels[cityId] ?? 'loading city…',
      shortName: city?.name ?? null,
    }
  })

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
    if (currentScope !== 'custom' || !selectedCitiesResolved) {
      return
    }

    const canonicalRouteCityIds = getCanonicalExploreCityIds(
      search.selectedCityIds,
      selectedCities,
      { dropUnresolved: true },
    )
    if (areExploreCityIdsEqual(search.selectedCityIds, canonicalRouteCityIds)) {
      return
    }

    updateSearch({
      scope: canonicalRouteCityIds.length > 0 ? 'custom' : 'global',
      selectedCityIds: canonicalRouteCityIds,
    })
  }, [
    currentScope,
    search.selectedCityIds,
    selectedCities,
    selectedCitiesResolved,
    updateSearch,
  ])

  const applyCityIds = (
    nextCityIds: Array<string | Id<'cities'>>,
    nextCities: Array<Doc<'cities'>> = selectedCities,
  ) => {
    // A member's feed waits for their preferences; visitors have none.
    if (viewer && !explorePrefs) {
      return
    }

    const nextCityIdStrings = getCanonicalExploreCityIds(
      nextCityIds.map((cityId) => String(cityId)),
      nextCities,
    )
    const nextScope = nextCityIdStrings.length > 0 ? 'custom' : 'global'

    updateSearch({
      scope: nextScope,
      selectedCityIds: nextCityIdStrings,
    })
    setCityQuery('')
  }

  const handleDismiss = async (
    projectId: Id<'projects'>,
    projectKey: string,
  ) => {
    setDismissedIds((current) => new Set(current).add(projectKey))

    try {
      await dismissProject({ projectId })
    } catch (error) {
      reportActionError(error, { title: "couldn't hide this project" })
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
      reportActionError(error, { title: "couldn't hide this post" })
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
      reportActionError(error, {
        title: "couldn't reset explore",
        retry: handleResetExplore,
      })
    } finally {
      setResetPending(false)
    }
  }

  // Shared by the follow toggle and its undo; rejects so each caller reports.
  const setUserFollowed = async (
    userId: Id<'users'>,
    userKey: string,
    currentlyFollowed: boolean,
  ) => {
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
      if (followingQueryKey) {
        await queryClient.invalidateQueries({ queryKey: followingQueryKey })
      }
    } catch (error) {
      setFollowOverrides((current) => ({
        ...current,
        [userKey]: currentlyFollowed,
      }))
      throw error
    } finally {
      setPendingFollows((current) => {
        const next = new Set(current)
        next.delete(userKey)
        return next
      })
    }
  }

  const getFeedUserHandle = (userKey: string) => {
    if (!('items' in feedState)) return null
    for (const item of feedState.items) {
      if ('ownerUserId' in item && String(item.ownerUserId) === userKey) {
        return item.authorHandle
      }
      if ('githubUsername' in item && String(item.userId) === userKey) {
        return item.githubUsername
      }
    }
    return null
  }

  const handleFollow = async (
    userId: Id<'users'>,
    userKey: string,
    currentlyFollowed: boolean,
  ) => {
    if (pendingFollows.has(userKey)) return
    const handle = getFeedUserHandle(userKey)

    try {
      await setUserFollowed(userId, userKey, currentlyFollowed)
    } catch (error) {
      reportActionError(error, {
        title: currentlyFollowed ? "couldn't unfollow" : "couldn't follow",
        retry: () => handleFollow(userId, userKey, currentlyFollowed),
      })
      return
    }

    if (currentlyFollowed) {
      showUndoToast({
        message: handle ? `unfollowed @${handle}` : 'unfollowed',
        undo: () => setUserFollowed(userId, userKey, false),
      })
    }
  }

  const removeCityById = (cityId: string) =>
    applyCityIds(
      removeExploreCityId({
        cities: selectedCities,
        cityId,
        cityIds: effectiveSelectedCityIds,
      }),
      selectedCities,
    )

  const handleClearCityFilters = () => {
    updateSearch({ scope: 'global', selectedCityIds: [] })
  }

  const handleFiltersChange = (next: ExploreFilters) => updateSearch(next)
  const activeFilters = hasModeFilters
    ? {
        description: describeExploreFilters(modeFilters),
        onClear: () =>
          updateSearch({
            language: undefined,
            openToCollab: undefined,
            topic: undefined,
          }),
      }
    : undefined

  // An explicitly chosen single city whose browse feed turned out empty
  // (C2): name it, count its builders, list a few, and offer two actions.
  // Nothing here changes the scope without a click.
  const explicitCityId =
    currentScope === 'custom' && queryCityIds.length === 1
      ? (queryCityIds[0] ?? null)
      : null
  const isEmptyExplicitCity =
    explicitCityId !== null &&
    feedState.source === 'browse' &&
    feedState.status === 'exhausted'
  const cityStatsQuery = useQuery(
    cityStatsQueryOptions(isEmptyExplicitCity ? explicitCityId : null),
  )
  const localBuilderArgs =
    isEmptyExplicitCity && explicitCityId && currentMode !== 'builders'
      ? { cityIds: [explicitCityId] }
      : 'skip'
  const viewerLocalBuilders = usePaginatedQuery(
    api.explore.listNearbyBuilders,
    isVisitor ? 'skip' : localBuilderArgs,
    { initialNumItems: EMPTY_CITY_BUILDER_LIMIT },
  )
  const publicLocalBuilders = usePaginatedQuery(
    api.explore.listNearbyBuildersPublic,
    isVisitor ? localBuilderArgs : 'skip',
    { initialNumItems: EMPTY_CITY_BUILDER_LIMIT },
  )
  const explicitCityChip = selectedCityChips.find(
    (chip) => chip.id === String(explicitCityId),
  )
  const emptyCity: ExploreEmptyCity | undefined =
    explicitCityId && explicitCityChip
      ? {
          cityName: explicitCityChip.shortName ?? explicitCityChip.name,
          builderCount:
            (cityStatsQuery.data as { builderCount: number } | null | undefined)
              ?.builderCount ?? null,
          localBuilders: (
            (isVisitor ? publicLocalBuilders : viewerLocalBuilders)
              .results as BuilderPreview[]
          ).slice(0, EMPTY_CITY_BUILDER_LIMIT),
          onBrowseEverywhere: handleClearCityFilters,
          onChooseAnotherCity: () => {
            document.getElementById(EXPLORE_CITY_INPUT_ID)?.focus()
          },
        }
      : undefined
  const visitor = isVisitor ? { signInRedirect } : undefined

  return (
    <div className="lx-page-shell">
      <ExploreHeader
        availableCities={availableCities}
        cityQuery={cityQuery}
        citySearchPending={citySearchResultsQuery.isLoading}
        currentScope={currentScope}
        filters={search}
        mode={currentMode}
        onCityQueryChange={setCityQuery}
        onFiltersChange={handleFiltersChange}
        onModeChange={updateExploreMode}
        onRemoveCity={removeCityById}
        onResetExplore={isVisitor ? undefined : handleResetExplore}
        onSelectCity={(city) =>
          applyCityIds([...queryCityIds, city._id], [...selectedCities, city])
        }
        onSearchQueryChange={setLocalSearchQuery}
        resetPending={resetPending}
        searchQuery={localSearchQuery}
        searchStatusActive={debouncedSearchQuery.length > 0}
        selectedCityChips={selectedCityChips}
        showSearch={!isVisitor}
      />

      <div className="lx-page-scroll" data-scroll-restoration-id="explore-feed">
        <div className="lx-page-width-wide min-w-0">
          <ExploreFeed
            activeFilters={activeFilters}
            emptyCity={emptyCity}
            entranceKey={entranceKey}
            followOverrides={followOverrides}
            followedUserIds={followedUserIds}
            likedProjectIds={likedProjectIds}
            onClearCityFilters={handleClearCityFilters}
            onDismissPost={handleDismissPost}
            onDismissProject={handleDismiss}
            onFollowUser={handleFollow}
            onLoadMore={handleLoadMore}
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
            onResetExplore={isVisitor ? undefined : handleResetExplore}
            orderingCopy={getExploreOrderingCopy({
              isVisitor,
              mode: currentMode,
            })}
            pendingFollows={pendingFollows}
            pendingUserId={pendingUserId}
            resetPending={resetPending}
            state={feedState}
            viewerId={viewerId}
            visitor={visitor}
          />
        </div>
      </div>
    </div>
  )
}
