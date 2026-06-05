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
  projectSearchQueryOptions,
  postSearchQueryOptions,
} from '@/features/explore/queries'
import { followingQueryOptions } from '@/features/follows/queries'
import {
  citiesByIdsQueryOptions,
  citiesSearchQueryOptions,
} from '@/features/cities/queries'
import { useLikeProject, useUnlikeProject } from '@/features/projects/mutations'
import { showGithubSyncFeedback } from '@/features/projects/github-sync-feedback'
import { useFollowUser, useUnfollowUser } from '@/features/follows/mutations'
import { useDismissExploreProject } from '@/features/explore/mutations'
import { useOpenConversation } from '@/features/inbox/use-open-conversation'
import { disabledQuery } from '@/lib/query'
import { FeedRoutePending } from '@/components/app-shell/route-pending'
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
  pendingMs: 250,
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
  const [pendingLikes, setPendingLikes] = useState<Set<string>>(new Set())
  const [pendingFollows, setPendingFollows] = useState<Set<string>>(new Set())
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
  const nearbyBuilderCityIds = getNearbyBuilderCityIds({
    scope: currentScope,
    selectedCityIds: canonicalSelectedCityIds,
  }) as Array<Id<'cities'>>

  const scopedFeedQuery = useQuery({
    ...exploreFeedQueryOptions({
      scope: currentScope,
      selectedCityIds: queryCityIds,
    }),
    enabled: currentMode === 'projects',
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
      ? postSearchQueryOptions({
          cityIds: queryCityIds,
          q: debouncedSearchQuery,
        })
      : disabledQuery(
          postSearchQueryOptions({
            cityIds: [],
            q: '',
          }),
        ),
  )
  const feedQueryKey = exploreFeedQueryOptions({
    scope: currentScope,
    selectedCityIds: queryCityIds,
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
    onSuccess: (result) => {
      showGithubSyncFeedback(result)
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: feedQueryKey }),
        queryClient.invalidateQueries({ queryKey: likedProjectIdsQueryKey }),
      ])
    },
  })

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
  const postResults =
    (postSearchQuery.data as Array<Doc<'posts'>> | undefined) ?? []
  const displayedItems = isProjectSearchActive
    ? (projectSearchData?.projects ?? [])
    : items
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
        onSelectCity={(city) =>
          void persistCityIds(
            [...queryCityIds, city._id],
            [...selectedCities, city],
          )
        }
        onSearchQueryChange={setLocalSearchQuery}
        pendingCityIds={pendingCityIds}
        searchQuery={localSearchQuery}
        selectedCityChips={selectedCityChips}
      />

      <div className="lx-page-scroll">
        <div className="lx-page-width-detail min-w-0">
          <ExploreFeed
            builderResults={builderResults}
            builderSearchLoading={builderSearchQuery.isLoading}
            debouncedSearchQuery={debouncedSearchQuery}
            dismissedIds={dismissedIds}
            followOverrides={followOverrides}
            followedUserIds={followedUserIds}
            isBuilderSearchActive={isBuilderSearchActive}
            isBuildersMode={currentMode === 'builders'}
            isGlobalFeed={isGlobalFeed}
            isPostSearchActive={isPostSearchActive}
            isPostsMode={currentMode === 'posts'}
            isProjectSearchActive={isProjectSearchActive}
            items={displayedItems}
            likedProjectIds={likedProjectIds}
            onDismissProject={handleDismiss}
            onFollowUser={handleFollow}
            onLikeProject={handleLike}
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
            onOpenPostResult={(postTarget) =>
              void navigate({
                to: '/project/$owner/$repo',
                params: { owner: postTarget.owner, repo: postTarget.repo },
                search: { comment: null, post: String(postTarget.postId) },
                hash: `post-${String(postTarget.postId)}`,
              })
            }
            onOpenProject={(project) =>
              void navigate({
                to: '/project/$owner/$repo',
                params: { owner: project.owner, repo: project.repo },
                search: { comment: null },
              })
            }
            onOpenProjectOwner={(project) =>
              void navigate({
                to: '/u/$username',
                params: { username: project.owner },
                search: { tab: 'projects' },
              })
            }
            pendingFollows={pendingFollows}
            pendingLikes={pendingLikes}
            pendingUserId={pendingUserId}
            postSearchLoading={postSearchQuery.isLoading}
            postResults={postResults}
            viewerId={viewerId}
          />
        </div>
      </div>
    </div>
  )
}
