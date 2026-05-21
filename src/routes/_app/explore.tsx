import { createFileRoute } from '@tanstack/react-router'
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import {
  builderSearchQueryOptions,
  exploreFeedQueryOptions,
  nearbyBuildersQueryOptions,
} from '@/features/explore/queries'
import { followingQueryOptions } from '@/features/follows/queries'
import {
  citiesByIdsQueryOptions,
  citiesSearchQueryOptions,
  popularCitiesQueryOptions,
} from '@/features/cities/queries'
import { ProjectCard } from '@/components/ui/project-card'
import { Input } from '@/components/ui/input'
import { CityPill } from '@/components/ui/city-pill'
import { CityCombobox } from '@/components/ui/city-combobox'
import { EmptyState } from '@/components/ui/empty-state'
import { LxAvatar } from '@/components/ui/lx-avatar'
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
  type ProjectCardPreview,
  type ViewerExplorePrefsPayload,
  type ViewerLikedProjectIdsPayload,
} from '@/features/contracts'
import { toProjectCardData } from '@/features/project-card-preview'
import {
  viewerExplorePrefsQueryOptions,
  viewerLikedProjectIdsQueryOptions,
} from '@/features/viewer/queries'
import {
  deriveDefaultExploreCityIds,
  getExploreProjectCityIds,
  getExploreScopeStatusCopy,
  isExploreProjectFeedGlobal,
  normalizeExploreSearch,
} from '@/features/explore/state'

type BuilderPreview = {
  userId: Id<'users'>
  displayName: string
  avatarUrl: string | null
  githubUsername: string
  projectsCount: number
  followersCount: number
}

type ExploreFeedPayload = {
  scope: 'default' | 'global' | 'custom'
  appliedCityIds: Array<Id<'cities'>>
  isCityFiltered: boolean
  projects: Array<ProjectCardPreview>
}

function updateExploreFeedPayload(
  payload: ExploreFeedPayload | undefined,
  projectId: Id<'projects'>,
  currentlyLiked: boolean,
  nextLiked: boolean,
) {
  if (!payload) {
    return payload
  }

  const delta = nextLiked === currentlyLiked ? 0 : nextLiked ? 1 : -1

  return {
    ...payload,
    projects: payload.projects.map((project) =>
      project.projectId === projectId
        ? {
            ...project,
            locaticLikes: Math.max(0, project.locaticLikes + delta),
          }
        : project,
    ),
  }
}

function updateLikedProjectIdsPayload(
  payload: ViewerLikedProjectIdsPayload | undefined,
  projectId: Id<'projects'>,
  nextLiked: boolean,
) {
  if (!payload) {
    return payload
  }

  const likedProjectIds = new Set(payload.likedProjectIds)
  if (nextLiked) {
    likedProjectIds.add(projectId)
  } else {
    likedProjectIds.delete(projectId)
  }

  return {
    ...payload,
    likedProjectIds: [...likedProjectIds],
  }
}

export const Route = createFileRoute('/_app/explore')({
  validateSearch: normalizeExploreSearch,
  loaderDeps: ({ search }) => normalizeExploreSearch(search),
  loader: async ({ context, deps }) => {
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
    const defaultScopedCityIds = defaultCityIds as Array<Id<'cities'>>

    await Promise.all([
      context.queryClient.ensureQueryData(
        exploreFeedQueryOptions({
          scope: deps.scope,
          selectedCityIds,
        }),
      ),
      context.queryClient.ensureQueryData(
        nearbyBuildersQueryOptions(defaultScopedCityIds),
      ),
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
  const defaultScopedCityIds = defaultCityIds as Array<Id<'cities'>>
  const viewerId = explorePrefs?.viewerId
  const currentScope = search.scope
  const isGlobalFeed = isExploreProjectFeedGlobal(currentScope)

  const scopedFeedQuery = useQuery({
    ...exploreFeedQueryOptions({
      scope: currentScope,
      selectedCityIds,
    }),
  })
  const { data: nearbyBuildersData } = useSuspenseQuery(
    nearbyBuildersQueryOptions(defaultScopedCityIds),
  )
  const { data: followingData } = useSuspenseQuery(
    followingQueryOptions(viewerId as Id<'users'>),
  )

  const likeProject = useLikeProject()
  const unlikeProject = useUnlikeProject()
  const followUser = useFollowUser()
  const unfollowUser = useUnfollowUser()
  const dismissProject = useDismissExploreProject()
  const { openConversation, pendingUserId } = useOpenConversation()

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
  const [builderQuery, setBuilderQuery] = useState('')
  const [cityQuery, setCityQuery] = useState('')
  const [debouncedBuilderQuery, setDebouncedBuilderQuery] = useState('')

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedBuilderQuery(builderQuery.trim())
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [builderQuery])

  const selectedCitiesQuery = useQuery({
    ...citiesByIdsQueryOptions(selectedCityIds),
    enabled: selectedCityIds.length > 0,
  })
  const popularCitiesQuery = useQuery(popularCitiesQueryOptions())
  const citySearchResultsQuery = useQuery({
    ...citiesSearchQueryOptions(cityQuery.trim() || 'unused'),
    enabled: cityQuery.trim().length > 0,
  })
  const builderSearchQuery = useQuery(
    debouncedBuilderQuery.length > 0
      ? builderSearchQueryOptions(debouncedBuilderQuery)
      : disabledQuery(builderSearchQueryOptions('')),
  )
  const feedQueryKey = exploreFeedQueryOptions({
    scope: currentScope,
    selectedCityIds,
  }).queryKey
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

  const selectedCities =
    (selectedCitiesQuery.data as Array<Doc<'cities'>> | undefined) ?? []

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
  const items = projects.filter(
    (item) => !dismissedIds.has(String(item.projectId)),
  )
  const nearbyBuilders =
    (nearbyBuildersData as Array<BuilderPreview> | undefined) ?? []
  const builderResults =
    (builderSearchQuery.data as Array<BuilderPreview> | undefined) ?? []
  const isBuilderSearchActive = debouncedBuilderQuery.length > 0
  const hasSelectedCities = effectiveSelectedCityIds.length > 0

  const selectedCityChips = effectiveSelectedCityIds.map((cityId: string) => ({
    id: cityId,
    name: selectedCityLabels[cityId] ?? 'loading city…',
  }))

  const cityResults =
    cityQuery.trim().length > 0
      ? ((citySearchResultsQuery.data as Array<Doc<'cities'>> | undefined) ??
        [])
      : ((popularCitiesQuery.data as Array<Doc<'cities'>> | undefined) ?? [])
  const availableCities = cityResults.filter(
    (city: Doc<'cities'>) =>
      !effectiveSelectedCityIds.includes(String(city._id)),
  )
  const updateSearch = (next: Partial<typeof search>) =>
    void navigate({
      to: '/explore',
      search: {
        ...search,
        ...next,
      },
      replace: true,
      resetScroll: false,
    })

  const persistCityIds = async (nextCityIds: Array<Id<'cities'>>) => {
    if (!explorePrefs) {
      return
    }

    const nextCityIdStrings = Array.from(
      new Set(nextCityIds.map((cityId) => String(cityId))),
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
      selectedCityIds.filter((selectedId) => String(selectedId) !== cityId),
    )

  return (
    <div className="lx-page-shell">
      <header className="shrink-0 border-b border-line px-(--lx-gutter) py-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1.5 font-mono text-[11px] lowercase text-text-faint">
              // discover builders and projects nearby
            </div>
            <h1 className="font-mono text-[22px] font-semibold tracking-[-0.02em] text-text">
              explore
            </h1>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11.5px] text-text-faint">
            <span>{getExploreScopeStatusCopy(currentScope)}</span>
            {pendingCityIds && <span>saving…</span>}
          </div>
        </div>

        {selectedCityChips.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {selectedCityChips.map((city: { id: string; name: string }) => (
              <CityPill
                key={city.id}
                city={city.name}
                className="shrink-0"
                onRemove={() => removeCityById(city.id)}
              />
            ))}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <Input
            type="text"
            placeholder="search builders by username or name"
            value={builderQuery}
            onChange={(event) => setBuilderQuery(event.target.value)}
            className="border-line bg-canvas font-mono text-sm text-text placeholder:text-text-faint"
            aria-label="Search builders"
          />

          <CityCombobox
            id="explore-city"
            label="Search and add city filters"
            query={cityQuery}
            onQueryChange={setCityQuery}
            cities={availableCities}
            onSelectCity={(city) =>
              void persistCityIds([...selectedCityIds, city._id])
            }
            placeholder="search and add city filters"
          />
        </div>
      </header>

      <div className="lx-page-scroll">
        <div className="flex min-w-0 flex-col gap-8 md:flex-row md:items-start">
          <div className="lx-page-width-feed-left min-w-0 flex-1">
            {!isBuilderSearchActive && !isGlobalFeed && items.length === 0 && (
              <div className="py-10">
                <EmptyState
                  title="no projects match these cities yet."
                  description="Try another city, remove one of your selected filters, or check back after more projects are imported."
                />
              </div>
            )}

            {!isBuilderSearchActive && isGlobalFeed && items.length === 0 && (
              <div className="py-10">
                <EmptyState
                  title="nothing to explore right now."
                  description="Try searching for builders, add city filters, or check back after more projects are imported."
                />
              </div>
            )}

            {isBuilderSearchActive && builderSearchQuery.isLoading && (
              <div className="py-5 text-center font-mono text-[12.5px] text-text-faint">
                searching builders…
              </div>
            )}

            {isBuilderSearchActive && builderResults.length > 0 && (
              <div className="mb-8">
                <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-faint">
                  matching builders
                </div>
                <div className="flex flex-col gap-2">
                  {builderResults.map((builder) => (
                    <NearbyBuilderRow
                      key={builder.userId}
                      builder={builder}
                      onOpenProfile={() =>
                        void navigate({
                          to: '/u/$username',
                          params: {
                            username: builder.githubUsername,
                          },
                          search: { tab: 'projects' },
                        })
                      }
                      onFollow={() =>
                        void handleFollow(
                          builder.userId,
                          String(builder.userId),
                          followedUserIds.has(String(builder.userId)),
                        )
                      }
                      followed={
                        followOverrides[String(builder.userId)] ??
                        followedUserIds.has(String(builder.userId))
                      }
                      followPending={pendingFollows.has(String(builder.userId))}
                      onMessage={
                        viewerId && builder.userId !== viewerId
                          ? () => void openConversation(builder.userId)
                          : undefined
                      }
                      messagePending={pendingUserId === String(builder.userId)}
                      isSelf={builder.userId === viewerId}
                    />
                  ))}
                </div>
              </div>
            )}

            {isBuilderSearchActive &&
              builderResults.length === 0 &&
              !builderSearchQuery.isLoading && (
                <div className="py-5 text-center font-mono text-[12.5px] text-text-faint">
                  no builders found for &ldquo;{debouncedBuilderQuery}&rdquo;
                </div>
              )}

            {!isBuilderSearchActive && items.length > 0 && (
              <div className="flex flex-col gap-3.5">
                {items.map((item, index) => {
                  const owner = item.owner
                  const repo = item.repo
                  const projectId = item.projectId
                  const projectKey = String(item.projectId)
                  const ownerId = item.ownerUserId
                  const ownerKey = item.authorHandle
                  const liked = likedProjectIds.has(projectKey)
                  const followed =
                    followOverrides[ownerKey] ?? followedUserIds.has(ownerKey)

                  return (
                    <ProjectCard
                      key={projectId}
                      project={{
                        ...toProjectCardData(item),
                        liked,
                        followed,
                        isRecommended: index === 0,
                      }}
                      onDismiss={() =>
                        void handleDismiss(projectId, projectKey)
                      }
                      onLike={() => void handleLike(projectId, projectKey)}
                      onAuthorClick={() =>
                        void navigate({
                          to: '/u/$username',
                          params: { username: owner },
                          search: { tab: 'projects' },
                        })
                      }
                      onFollow={() =>
                        void handleFollow(ownerId, ownerKey, followed)
                      }
                      onDM={
                        viewerId !== ownerId
                          ? () => void openConversation(ownerId)
                          : undefined
                      }
                      onCardClick={() =>
                        void navigate({
                          to: '/project/$owner/$repo',
                          params: { owner, repo },
                          search: { comment: null },
                        })
                      }
                      likePending={pendingLikes.has(projectKey)}
                      followPending={pendingFollows.has(ownerKey)}
                      dmPending={pendingUserId === ownerKey}
                    />
                  )
                })}
              </div>
            )}

            <div className="mt-8 md:hidden">
              <ExploreRail
                hasSelectedCities={hasSelectedCities}
                nearbyBuilders={nearbyBuilders}
                compact
                onFollowBuilder={(builder) =>
                  void handleFollow(
                    builder.userId,
                    String(builder.userId),
                    followedUserIds.has(String(builder.userId)),
                  )
                }
                onMessageBuilder={(builder) =>
                  viewerId && builder.userId !== viewerId
                    ? () => void openConversation(builder.userId)
                    : undefined
                }
                onOpenBuilderProfile={(builder) =>
                  void navigate({
                    to: '/u/$username',
                    params: {
                      username: builder.githubUsername,
                    },
                    search: { tab: 'projects' },
                  })
                }
                onRemoveCity={removeCityById}
                pendingFollows={pendingFollows}
                pendingUserId={pendingUserId}
                selectedCityChips={selectedCityChips}
                followedUserIds={followedUserIds}
                followOverrides={followOverrides}
                viewerId={viewerId}
              />
            </div>
          </div>

          <aside className="sticky top-6 hidden w-full shrink-0 md:block md:w-70">
            <ExploreRail
              hasSelectedCities={hasSelectedCities}
              nearbyBuilders={nearbyBuilders}
              compact
              onFollowBuilder={(builder) =>
                void handleFollow(
                  builder.userId,
                  String(builder.userId),
                  followedUserIds.has(String(builder.userId)),
                )
              }
              onMessageBuilder={(builder) =>
                viewerId && builder.userId !== viewerId
                  ? () => void openConversation(builder.userId)
                  : undefined
              }
              onOpenBuilderProfile={(builder) =>
                void navigate({
                  to: '/u/$username',
                  params: {
                    username: builder.githubUsername,
                  },
                  search: { tab: 'projects' },
                })
              }
              onRemoveCity={removeCityById}
              pendingFollows={pendingFollows}
              pendingUserId={pendingUserId}
              selectedCityChips={selectedCityChips}
              followedUserIds={followedUserIds}
              followOverrides={followOverrides}
              viewerId={viewerId}
            />
          </aside>
        </div>
      </div>
    </div>
  )
}

function ExploreRail({
  compact = false,
  followOverrides,
  followedUserIds,
  hasSelectedCities,
  nearbyBuilders,
  onFollowBuilder,
  onMessageBuilder,
  onOpenBuilderProfile,
  onRemoveCity,
  pendingFollows,
  pendingUserId,
  selectedCityChips,
  viewerId,
}: {
  compact?: boolean
  followOverrides: Record<string, boolean>
  followedUserIds: Set<string>
  hasSelectedCities: boolean
  nearbyBuilders: BuilderPreview[]
  onFollowBuilder: (builder: BuilderPreview) => void
  onMessageBuilder: (builder: BuilderPreview) => (() => void) | undefined
  onOpenBuilderProfile: (builder: BuilderPreview) => void
  onRemoveCity: (cityId: string) => void
  pendingFollows: Set<string>
  pendingUserId: string | null
  selectedCityChips: Array<{ id: string; name: string }>
  viewerId?: Id<'users'>
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-card border border-line bg-surface px-4 py-4 shadow-card">
        <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-faint">
          nearby builders
        </div>
        <p className="mb-4 font-sans text-[13px] leading-6 text-text-muted">
          Builders around your default city context. This rail stays stable even
          when the main feed goes global or you search people directly.
        </p>
        {nearbyBuilders.length > 0 ? (
          <div className="flex flex-col gap-2">
            {nearbyBuilders.map((builder) => (
              <NearbyBuilderRow
                key={builder.userId}
                builder={builder}
                compact={compact}
                onOpenProfile={() => onOpenBuilderProfile(builder)}
                onFollow={() => onFollowBuilder(builder)}
                followed={
                  followOverrides[String(builder.userId)] ??
                  followedUserIds.has(String(builder.userId))
                }
                followPending={pendingFollows.has(String(builder.userId))}
                onMessage={onMessageBuilder(builder)}
                messagePending={pendingUserId === String(builder.userId)}
                isSelf={builder.userId === viewerId}
              />
            ))}
          </div>
        ) : (
          <div className="font-mono text-[11px] leading-5 text-text-faint">
            no nearby builders are available in your default city context yet.
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-faint">
          city filters
        </div>
        <p className="mb-3 font-mono text-[11px] leading-5 text-text-faint">
          {hasSelectedCities
            ? 'Selected cities are strict for projects. Remove chips to broaden the feed again.'
            : 'Project discovery is following your current scope. Add one or more cities to narrow it down.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {selectedCityChips.length > 0 ? (
            selectedCityChips.map((city) => (
              <CityPill
                key={`aside-${city.id}`}
                city={city.name}
                onRemove={() => onRemoveCity(city.id)}
              />
            ))
          ) : (
            <span className="font-mono text-[11px] text-text-faint">
              no city filters selected
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function NearbyBuilderRow({
  builder,
  compact = false,
  onOpenProfile,
  onFollow,
  onMessage,
  followed,
  followPending,
  messagePending,
  isSelf,
}: {
  builder: BuilderPreview
  compact?: boolean
  onOpenProfile: () => void
  onFollow: () => void
  onMessage?: () => void
  followed: boolean
  followPending: boolean
  messagePending?: boolean
  isSelf?: boolean
}) {
  if (compact) {
    return (
      <div className="border-b border-line py-3 last:border-b-0">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onOpenProfile}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-md bg-transparent p-0 text-left transition-colors hover:text-text"
          >
            <LxAvatar
              name={builder.displayName}
              avatarUrl={builder.avatarUrl}
              size={32}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-[13px] font-semibold text-text">
                {builder.displayName}
              </div>
              <div className="truncate font-mono text-[11px] text-text-faint">
                @{builder.githubUsername}
                {isSelf ? ' · you' : ''}
              </div>
            </div>
          </button>

          {!isSelf && (
            <button
              type="button"
              onClick={onFollow}
              disabled={followPending}
              className={`min-h-11 min-w-29 shrink-0 self-start rounded-md border px-3 py-2 text-center font-mono text-[11.5px] transition-colors ${
                followed
                  ? 'border-text-muted bg-transparent text-text'
                  : 'border-line bg-transparent text-text-muted hover:border-text-muted hover:text-text'
              }`}
            >
              {followPending ? '…' : followed ? 'following' : 'follow'}
            </button>
          )}
        </div>

        {onMessage && (
          <button
            type="button"
            onClick={onMessage}
            disabled={messagePending}
            className="mt-3 flex min-h-11 w-full items-center justify-center rounded-md border border-line px-3 py-2 font-mono text-[11.5px] text-text-muted transition-colors hover:border-text-muted hover:text-text disabled:cursor-default disabled:opacity-60"
          >
            {messagePending ? 'opening…' : 'message'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 border-b border-line py-2 last:border-b-0">
      <button
        type="button"
        onClick={onOpenProfile}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md bg-transparent p-0 text-left transition-colors hover:text-text"
      >
        <LxAvatar
          name={builder.displayName}
          avatarUrl={builder.avatarUrl}
          size={32}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[13px] font-semibold text-text">
            {builder.displayName}
          </div>
          <div className="truncate font-mono text-[11px] text-text-faint">
            @{builder.githubUsername}
            {isSelf ? ' · you' : ''}
          </div>
        </div>
      </button>
      <div className="flex items-center gap-2">
        {onMessage && (
          <button
            type="button"
            onClick={onMessage}
            disabled={messagePending}
            className="min-h-11 min-w-24 rounded-md border border-line px-3 py-2 font-mono text-[11.5px] text-text-muted transition-colors hover:border-text-muted hover:text-text disabled:cursor-default disabled:opacity-60"
          >
            {messagePending ? 'opening…' : 'message'}
          </button>
        )}
        {!isSelf && (
          <button
            type="button"
            onClick={onFollow}
            disabled={followPending}
            className={`min-h-11 min-w-22 rounded-md border px-3 py-2 font-mono text-[11.5px] transition-colors ${
              followed
                ? 'border-text-muted bg-transparent text-text'
                : 'border-line bg-transparent text-text-muted hover:border-text-muted hover:text-text'
            }`}
          >
            {followPending ? '…' : followed ? 'following' : 'follow'}
          </button>
        )}
      </div>
    </div>
  )
}
