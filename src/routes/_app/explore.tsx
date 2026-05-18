import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { skipToken, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { Doc } from '../../../convex/_generated/dataModel'
import {
  builderSearchQueryOptions,
  exploreFeedQueryOptions,
  nearbyBuildersQueryOptions,
} from '@/features/explore/queries'
import { privateProfileQueryOptions } from '@/features/profile/queries'
import { followingQueryOptions } from '@/features/follows/queries'
import {
  citiesByIdsQueryOptions,
  citiesSearchQueryOptions,
  popularCitiesQueryOptions,
} from '@/features/cities/queries'
import {
  ProjectCard,
  ProjectCardSkeleton,
  type ProjectCardData,
} from '@/components/ui/project-card'
import { Input } from '@/components/ui/input'
import { CityPill } from '@/components/ui/city-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { relativeTime } from '@/lib/time'
import { useLikeProject, useUnlikeProject } from '@/features/projects/mutations'
import { useFollowUser, useUnfollowUser } from '@/features/follows/mutations'
import { Plus } from '@/lib/icons'
import {
  mapPrivateProfile,
  type PrivateProfilePayload,
} from '@/features/contracts'
import { useUpdateExploreConfig } from '@/features/settings/mutations'
import { useDismissExploreProject } from '@/features/explore/mutations'
import { useOpenConversation } from '@/features/inbox/use-open-conversation'

export const Route = createFileRoute('/_app/explore')({
  component: ExplorePage,
})

function ExplorePage() {
  const cityIdsMatch = (left: string[], right: string[]) =>
    left.length === right.length &&
    left.every((cityId, index) => cityId === right[index])

  const navigate = useNavigate()
  const feedQuery = useQuery(exploreFeedQueryOptions())
  const nearbyBuildersQuery = useQuery(nearbyBuildersQueryOptions())
  const profileQuery = useQuery(privateProfileQueryOptions())
  const profile = mapPrivateProfile(
    profileQuery.data as PrivateProfilePayload | undefined,
  )
  const viewerId = profile?.viewer.id
  const idleFollowingQuery = {
    queryKey: ['follows', 'idle'],
    queryFn: skipToken,
  } as any
  const followingQuery = useQuery(
    viewerId ? followingQueryOptions(viewerId as never) : idleFollowingQuery,
  )

  const likeProject = useLikeProject()
  const unlikeProject = useUnlikeProject()
  const followUser = useFollowUser()
  const unfollowUser = useUnfollowUser()
  const updateExploreConfig = useUpdateExploreConfig()
  const dismissProject = useDismissExploreProject()
  const { openConversation, pendingUserId } = useOpenConversation()

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [pendingLikes, setPendingLikes] = useState<Set<string>>(new Set())
  const [pendingFollows, setPendingFollows] = useState<Set<string>>(new Set())
  const [likedOverrides, setLikedOverrides] = useState<Record<string, boolean>>(
    {},
  )
  const [followOverrides, setFollowOverrides] = useState<
    Record<string, boolean>
  >({})
  const [selectedCityIds, setSelectedCityIds] = useState<string[]>([])
  const [selectedCityLabels, setSelectedCityLabels] = useState<
    Record<string, string>
  >({})
  const [didHydrateCities, setDidHydrateCities] = useState(false)
  const [isPersistingCities, setIsPersistingCities] = useState(false)
  const [cityQuery, setCityQuery] = useState('')
  const [builderQuery, setBuilderQuery] = useState('')
  const [debouncedBuilderQuery, setDebouncedBuilderQuery] = useState('')
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistInFlightRef = useRef(false)
  const queuedCityIdsRef = useRef<string[] | null>(null)
  const lastPersistedCityIdsRef = useRef<string[]>([])

  const initialCityIds = profile?.viewer.exploreConfig.cityIds.length
    ? profile.viewer.exploreConfig.cityIds.map(String)
    : profile?.viewer.cityId
      ? [String(profile.viewer.cityId)]
      : []

  useEffect(() => {
    if (didHydrateCities) return

    setSelectedCityIds(initialCityIds)
    setSelectedCityLabels((current) => {
      if (current && Object.keys(current).length > 0) {
        return current
      }

      if (initialCityIds.length === 1 && profile?.viewer.cityName) {
        return { [initialCityIds[0] ?? '']: profile.viewer.cityName }
      }

      return current
    })
    lastPersistedCityIdsRef.current = initialCityIds
    setDidHydrateCities(true)
  }, [didHydrateCities, initialCityIds, profile?.viewer.cityName])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedBuilderQuery(builderQuery.trim())
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [builderQuery])

  const idleBuilderSearchQuery = {
    queryKey: ['explore', 'searchBuilders', 'idle'],
    queryFn: skipToken,
  } as any
  const builderSearchQuery = useQuery(
    viewerId && debouncedBuilderQuery.trim().length > 0
      ? builderSearchQueryOptions(
          debouncedBuilderQuery,
          selectedCityIds as never[],
        )
      : idleBuilderSearchQuery,
  )

  const selectedCitiesQuery = useQuery({
    ...citiesByIdsQueryOptions(selectedCityIds as never[]),
    enabled: selectedCityIds.length > 0,
  })
  const popularCitiesQuery = useQuery(popularCitiesQueryOptions())
  const citySearchResultsQuery = useQuery({
    ...citiesSearchQueryOptions(cityQuery.trim() || 'unused'),
    enabled: cityQuery.trim().length > 0,
  })

  const likedProjectIds = new Set(
    profile?.likedProjects.map((likedProject) =>
      String(likedProject.projectId),
    ) ?? [],
  )
  const followedUserIds = new Set(
    ((followingQuery.data as Array<Doc<'follows'>> | undefined) ?? []).map(
      (follow) => String(follow.followingId),
    ),
  )

  const feedData = feedQuery.data as
    | {
        projects: Array<Doc<'projects'>>
        fallback: Array<Doc<'projects'>>
      }
    | undefined
  const allItems = feedData?.projects ?? []
  const items = allItems.filter((item) => !dismissedIds.has(String(item._id)))
  const fallbackItems = feedData?.fallback ?? []
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

  const cityResults =
    cityQuery.trim().length > 0
      ? ((citySearchResultsQuery.data as Array<Doc<'cities'>> | undefined) ??
        [])
      : ((popularCitiesQuery.data as Array<Doc<'cities'>> | undefined) ?? [])
  const suggestedCities = cityResults
    .filter((city) => !selectedCityIds.includes(String(city._id)))
    .slice(0, 6)
  const isLoading = feedQuery.isLoading || profileQuery.isLoading
  const hasSelectedCities = selectedCityIds.length > 0
  const selectedCityChips = selectedCityIds.map((cityId) => ({
    id: cityId,
    name: selectedCityLabels[cityId] ?? 'loading city…',
  }))
  const builderResults =
    (builderSearchQuery.data as
      | Array<{
          userId: string
          displayName: string
          avatarUrl: string | null
          githubUsername: string
          projectsCount: number
          followersCount: number
        }>
      | undefined) ?? []
  const nearbyBuilders =
    (nearbyBuildersQuery.data as
      | Array<{
          userId: string
          displayName: string
          avatarUrl: string | null
          githubUsername: string
          projectsCount: number
          followersCount: number
        }>
      | undefined) ?? []
  const isBuilderSearchActive = debouncedBuilderQuery.length > 0

  const persistExploreConfig = async (nextCityIds: string[]) => {
    if (!profile) return

    await updateExploreConfig({
      cityIds: nextCityIds as never[],
      stackPrefs: profile.viewer.exploreConfig.stackPrefs,
      appearInExplore: profile.viewer.appearInExplore,
    })
  }

  const queueCityPersist = (nextCityIds: string[]) => {
    queuedCityIdsRef.current = nextCityIds
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current)
    }

    persistTimeoutRef.current = setTimeout(() => {
      void flushCityPersist()
    }, 120)
  }

  const flushCityPersist = async () => {
    if (persistInFlightRef.current) {
      return
    }

    const nextCityIds = queuedCityIdsRef.current
    if (!nextCityIds) {
      return
    }

    if (cityIdsMatch(nextCityIds, lastPersistedCityIdsRef.current)) {
      queuedCityIdsRef.current = null
      return
    }

    persistInFlightRef.current = true
    setIsPersistingCities(true)

    try {
      await persistExploreConfig(nextCityIds)
      lastPersistedCityIdsRef.current = nextCityIds
      if (
        queuedCityIdsRef.current &&
        cityIdsMatch(queuedCityIdsRef.current, nextCityIds)
      ) {
        queuedCityIdsRef.current = null
      }
    } catch (error) {
      console.error('Failed to persist city filters', error)
      queuedCityIdsRef.current = lastPersistedCityIdsRef.current
      setSelectedCityIds(lastPersistedCityIdsRef.current)
      setSelectedCityLabels((current) => {
        const next: Record<string, string> = {}
        for (const cityId of lastPersistedCityIdsRef.current) {
          if (current[cityId]) {
            next[cityId] = current[cityId]
          }
        }
        return next
      })
    } finally {
      persistInFlightRef.current = false
      setIsPersistingCities(false)

      if (
        queuedCityIdsRef.current &&
        !cityIdsMatch(queuedCityIdsRef.current, lastPersistedCityIdsRef.current)
      ) {
        void flushCityPersist()
      }
    }
  }

  useEffect(() => {
    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current)
      }
    }
  }, [])

  const applySelectedCityIds = (
    nextCityIds: string[],
    nextLabels?: Record<string, string>,
  ) => {
    setSelectedCityIds(nextCityIds)
    if (nextLabels) {
      setSelectedCityLabels(nextLabels)
    } else {
      setSelectedCityLabels((current) => {
        const next: Record<string, string> = {}
        for (const cityId of nextCityIds) {
          if (current[cityId]) {
            next[cityId] = current[cityId]
          }
        }
        return next
      })
    }
    queueCityPersist(nextCityIds)
  }

  const handleDismiss = async (projectId: string) => {
    setDismissedIds((current) => new Set(current).add(projectId))

    try {
      await dismissProject({ projectId: projectId as never })
    } catch (error) {
      console.error('Dismiss failed', error)
      setDismissedIds((current) => {
        const next = new Set(current)
        next.delete(projectId)
        return next
      })
    }
  }

  const handleLike = async (projectId: string, currentlyLiked: boolean) => {
    if (pendingLikes.has(projectId)) return
    setPendingLikes((current) => new Set(current).add(projectId))
    setLikedOverrides((current) => ({
      ...current,
      [projectId]: !currentlyLiked,
    }))

    try {
      if (currentlyLiked) {
        await unlikeProject({ projectId: projectId as never })
      } else {
        await likeProject({ projectId: projectId as never })
      }
    } catch (error) {
      console.error('Like failed', error)
      setLikedOverrides((current) => ({
        ...current,
        [projectId]: currentlyLiked,
      }))
    } finally {
      setPendingLikes((current) => {
        const next = new Set(current)
        next.delete(projectId)
        return next
      })
    }
  }

  const handleFollow = async (userId: string, currentlyFollowed: boolean) => {
    if (pendingFollows.has(userId)) return
    setPendingFollows((current) => new Set(current).add(userId))
    setFollowOverrides((current) => ({
      ...current,
      [userId]: !currentlyFollowed,
    }))

    try {
      if (currentlyFollowed) {
        await unfollowUser({ targetUserId: userId as never })
      } else {
        await followUser({ targetUserId: userId as never })
      }
    } catch (error) {
      console.error('Follow failed', error)
      setFollowOverrides((current) => ({
        ...current,
        [userId]: currentlyFollowed,
      }))
    } finally {
      setPendingFollows((current) => {
        const next = new Set(current)
        next.delete(userId)
        return next
      })
    }
  }

  const explanationStats = [
    {
      l: 'selected cities',
      v: `${selectedCityIds.length}`,
    },
    { l: 'available now', v: `${items.length} repos` },
    { l: 'dismissed', v: `${dismissedIds.size}` },
  ]

  return (
    <div className="lx-page-shell flex flex-col xl:flex-row">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-line px-[var(--lx-gutter)] py-5">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-1.5 font-mono text-[11px] lowercase text-text-faint">
                // projects we think you'd like
              </div>
              <h1 className="font-mono text-[22px] font-semibold tracking-[-0.02em] text-text">
                explore
              </h1>
            </div>
            <div className="flex items-center gap-2 font-mono text-[11.5px] text-text-faint">
              <span>
                {hasSelectedCities
                  ? 'showing builders in'
                  : 'showing builders everywhere'}
              </span>
              {isPersistingCities && (
                <span className="text-[11px]">updating…</span>
              )}
            </div>
          </div>

          {selectedCityChips.length > 0 && (
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {selectedCityChips.map((city) => (
                <CityPill
                  key={city.id}
                  city={city.name}
                  className="shrink-0"
                  onRemove={() => {
                    const nextCityIds = selectedCityIds.filter(
                      (cityId) => cityId !== city.id,
                    )
                    applySelectedCityIds(nextCityIds)
                  }}
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
            <Input
              type="text"
              placeholder="filter by city"
              value={cityQuery}
              onChange={(event) => setCityQuery(event.target.value)}
              className="border-line bg-canvas font-mono text-sm text-text placeholder:text-text-faint"
              aria-label="Filter builders by city"
            />
          </div>

          {suggestedCities.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestedCities.map((city) => (
                <button
                  key={String(city._id)}
                  onClick={() => {
                    const nextCityIds = [...selectedCityIds, String(city._id)]
                    applySelectedCityIds(nextCityIds, {
                      ...selectedCityLabels,
                      [String(city._id)]: city.displayName,
                    })
                    setCityQuery('')
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-dashed border-line bg-transparent px-3 py-2 text-left font-mono text-[11.5px] text-text-muted transition-colors hover:border-text-muted hover:text-text"
                  type="button"
                >
                  <span>{city.displayName}</span>
                  <Plus size={11} />
                </button>
              ))}
            </div>
          )}
        </header>

        <div className="lx-page-scroll">
          <div className="lx-page-width-feed">
            {isLoading && (
              <div className="flex flex-col gap-3.5">
                {[1, 2, 3].map((skeletonId) => (
                  <ProjectCardSkeleton key={skeletonId} />
                ))}
              </div>
            )}

            {feedQuery.isError && (
              <EmptyState
                title="could not load explore right now"
                description="something went wrong building your discovery feed. try again in a moment."
                action={{
                  label: 'retry',
                  onClick: () => void feedQuery.refetch(),
                }}
              />
            )}

            {!isLoading &&
              !isBuilderSearchActive &&
              !feedQuery.isError &&
              items.length === 0 &&
              fallbackItems.length === 0 && (
                <div className="py-10">
                  <EmptyState
                    title={
                      hasSelectedCities
                        ? 'no projects in these cities yet.'
                        : 'nothing to explore right now.'
                    }
                    description={
                      hasSelectedCities
                        ? 'locatic is growing — add more cities or check back later.'
                        : 'follow more builders or check back later.'
                    }
                  />
                </div>
              )}

            {!isLoading &&
              !isBuilderSearchActive &&
              !feedQuery.isError &&
              items.length === 0 &&
              fallbackItems.length > 0 && (
                <div className="py-10">
                  <p className="mb-8 rounded-md border border-line px-3.5 py-2.5 font-mono text-[12.5px] text-text-muted">
                    {hasSelectedCities
                      ? 'No projects in your selected cities yet.'
                      : 'Nothing nearby right now.'}{' '}
                    <button
                      type="button"
                      onClick={() => {
                        applySelectedCityIds([])
                      }}
                      className="bg-transparent p-0 font-mono text-[12.5px] text-primary underline underline-offset-4 transition-colors hover:text-text"
                    >
                      Show builders everywhere
                    </button>
                  </p>
                  <div className="mb-4 font-mono text-[10.5px] uppercase tracking-[0.05em] text-text-faint">
                    meanwhile, from around the world
                  </div>
                  <div className="flex flex-col gap-3.5">
                    {fallbackItems.map((project) => {
                      const owner = project.github.fullName.split('/')[0] ?? ''
                      const repo = project.github.name
                      const projectId = String(project._id)
                      const cardData: ProjectCardData = {
                        id: projectId,
                        owner,
                        repo,
                        fullName: project.github.fullName,
                        description: project.github.description,
                        lang: project.github.primaryLanguage,
                        lastCommitLabel: relativeTime(
                          project.github.lastCommitAt,
                        ),
                        githubStars: project.github.stargazersCount,
                        locaticLikes: project.locatic.likesCount,
                        commentsCount: project.locatic.commentsCount,
                        authorName: project.ownerSnapshot.displayName,
                        authorHandle: owner,
                        authorAvatarUrl: project.ownerSnapshot.avatarUrl,
                        city: project.ownerSnapshot.cityName,
                        liked: false,
                        followed: false,
                      }
                      return (
                        <ProjectCard
                          key={projectId}
                          project={cardData}
                          showActions={false}
                          onAuthorClick={() =>
                            void navigate({
                              to: '/u/$username',
                              params: { username: owner } as never,
                            } as never)
                          }
                          onCardClick={() =>
                            void navigate({
                              to: '/project/$owner/$repo',
                              params: { owner, repo } as never,
                            } as never)
                          }
                        />
                      )
                    })}
                  </div>
                </div>
              )}

            {!isLoading &&
              isBuilderSearchActive &&
              builderSearchQuery.isLoading && (
                <div className="py-5 text-center font-mono text-[12.5px] text-text-faint">
                  searching builders…
                </div>
              )}

            {!isLoading &&
              isBuilderSearchActive &&
              builderResults.length > 0 && (
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
                            } as never,
                          } as never)
                        }
                        onFollow={() =>
                          void handleFollow(
                            builder.userId,
                            followedUserIds.has(builder.userId),
                          )
                        }
                        followed={
                          followOverrides[builder.userId] ??
                          followedUserIds.has(builder.userId)
                        }
                        followPending={pendingFollows.has(builder.userId)}
                        onMessage={
                          viewerId && builder.userId !== viewerId
                            ? () => void openConversation(builder.userId)
                            : undefined
                        }
                        messagePending={pendingUserId === builder.userId}
                        isSelf={builder.userId === viewerId}
                      />
                    ))}
                  </div>
                </div>
              )}

            {!isLoading &&
              isBuilderSearchActive &&
              builderResults.length === 0 &&
              !builderSearchQuery.isLoading && (
                <div className="py-5 text-center font-mono text-[12.5px] text-text-faint">
                  no builders found for &ldquo;{debouncedBuilderQuery}&rdquo;
                </div>
              )}

            {!isLoading &&
              !isBuilderSearchActive &&
              nearbyBuilders.length > 0 && (
                <div className="mb-8">
                  <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-faint">
                    nearby builders
                  </div>
                  <div className="flex flex-col gap-2">
                    {nearbyBuilders.map((builder) => (
                      <NearbyBuilderRow
                        key={builder.userId}
                        builder={builder}
                        onOpenProfile={() =>
                          void navigate({
                            to: '/u/$username',
                            params: {
                              username: builder.githubUsername,
                            } as never,
                          } as never)
                        }
                        onFollow={() =>
                          void handleFollow(
                            builder.userId,
                            followedUserIds.has(builder.userId),
                          )
                        }
                        followed={
                          followOverrides[builder.userId] ??
                          followedUserIds.has(builder.userId)
                        }
                        followPending={pendingFollows.has(builder.userId)}
                        onMessage={
                          viewerId && builder.userId !== viewerId
                            ? () => void openConversation(builder.userId)
                            : undefined
                        }
                        messagePending={pendingUserId === builder.userId}
                        isSelf={builder.userId === viewerId}
                      />
                    ))}
                  </div>
                </div>
              )}

            {!isLoading && !isBuilderSearchActive && items.length > 0 && (
              <div className="flex flex-col gap-3.5">
                {items.map((item, index) => {
                  const owner = item.github.fullName.split('/')[0] ?? ''
                  const repo = item.github.name
                  const projectId = String(item._id)
                  const ownerId = String(item.ownerId)
                  const liked =
                    likedOverrides[projectId] ?? likedProjectIds.has(projectId)
                  const followed =
                    followOverrides[ownerId] ?? followedUserIds.has(ownerId)

                  const cardData: ProjectCardData = {
                    id: projectId,
                    owner,
                    repo,
                    fullName: item.github.fullName,
                    description: item.github.description,
                    lang: item.github.primaryLanguage,
                    lastCommitLabel: relativeTime(item.github.lastCommitAt),
                    githubStars: item.github.stargazersCount,
                    locaticLikes: item.locatic.likesCount,
                    commentsCount: item.locatic.commentsCount,
                    authorName: item.ownerSnapshot.displayName,
                    authorHandle: owner,
                    authorAvatarUrl: item.ownerSnapshot.avatarUrl,
                    city: item.ownerSnapshot.cityName,
                    liked,
                    followed,
                    isRecommended: index === 0,
                  }

                  return (
                    <ProjectCard
                      key={String(item._id)}
                      project={cardData}
                      onDismiss={() => void handleDismiss(projectId)}
                      onLike={() => void handleLike(projectId, liked)}
                      onAuthorClick={() =>
                        void navigate({
                          to: '/u/$username',
                          params: { username: owner } as never,
                        } as never)
                      }
                      onFollow={() => void handleFollow(ownerId, followed)}
                      onDM={
                        viewerId !== ownerId
                          ? () => void openConversation(ownerId)
                          : undefined
                      }
                      onCardClick={() =>
                        void navigate({
                          to: '/project/$owner/$repo',
                          params: { owner, repo } as never,
                        } as never)
                      }
                      likePending={pendingLikes.has(projectId)}
                      followPending={pendingFollows.has(ownerId)}
                      dmPending={pendingUserId === ownerId}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <aside className="hidden w-[280px] shrink-0 flex-col gap-6 overflow-y-auto border-l border-line bg-canvas px-[var(--lx-gutter)] py-6 xl:flex">
        <div>
          <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-faint">
            why this feed
          </div>
          <div className="flex flex-col gap-3">
            {explanationStats.map((stat) => (
              <div key={stat.l}>
                <div className="mb-0.5 font-mono text-lg text-text">
                  {stat.v}
                </div>
                <div className="font-mono text-[11px] text-text-faint">
                  {stat.l}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-faint">
            city filters
          </div>
          <p className="mb-3 font-mono text-[11px] leading-5 text-text-faint">
            Use the city search above to tune who appears in builder search and
            which project feed fallback you see.
          </p>
          <div className="flex flex-wrap gap-2">
            {selectedCityChips.length > 0 ? (
              selectedCityChips.map((city) => (
                <CityPill
                  key={`aside-${city.id}`}
                  city={city.name}
                  onRemove={() => {
                    const nextCityIds = selectedCityIds.filter(
                      (cityId) => cityId !== city.id,
                    )
                    applySelectedCityIds(nextCityIds)
                  }}
                />
              ))
            ) : (
              <span className="font-mono text-[11px] text-text-faint">
                no city filters selected
              </span>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

function NearbyBuilderRow({
  builder,
  onOpenProfile,
  onFollow,
  onMessage,
  followed,
  followPending,
  messagePending,
  isSelf,
}: {
  builder: {
    userId: string
    displayName: string
    avatarUrl: string | null
    githubUsername: string
    projectsCount: number
  }
  onOpenProfile: () => void
  onFollow: () => void
  onMessage?: () => void
  followed: boolean
  followPending: boolean
  messagePending?: boolean
  isSelf?: boolean
}) {
  return (
    <div className="flex items-center gap-3 border-b border-line py-2">
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
          <div className="font-mono text-[11px] text-text-faint">
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
            className="min-h-11 min-w-[96px] rounded-md border border-line px-3 py-2 font-mono text-[11.5px] text-text-muted transition-colors hover:border-text-muted hover:text-text disabled:cursor-default disabled:opacity-60"
          >
            {messagePending ? 'opening…' : 'message'}
          </button>
        )}
        {!isSelf && (
          <button
            type="button"
            onClick={onFollow}
            disabled={followPending}
            className={`min-h-11 min-w-[88px] rounded-md border px-3 py-2 font-mono text-[11.5px] transition-colors ${
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
