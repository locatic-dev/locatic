import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { Doc } from '../../../convex/_generated/dataModel'
import { exploreFeedQueryOptions } from '@/features/explore/queries'
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
import { CityPill } from '@/components/ui/city-pill'
import { EmptyState } from '@/components/ui/empty-state'
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

export const Route = createFileRoute('/_app/explore')({
  component: ExplorePage,
})

function ExplorePage() {
  const navigate = useNavigate()
  const feedQuery = useQuery(exploreFeedQueryOptions())
  const profileQuery = useQuery(privateProfileQueryOptions())
  const profile = mapPrivateProfile(
    profileQuery.data as PrivateProfilePayload | undefined,
  )
  const viewerId = profile?.viewer.id
  const followingQuery = useQuery({
    ...followingQueryOptions(viewerId ?? ('missing' as never)),
    enabled: Boolean(viewerId),
  })

  const likeProject = useLikeProject()
  const unlikeProject = useUnlikeProject()
  const followUser = useFollowUser()
  const unfollowUser = useUnfollowUser()
  const updateExploreConfig = useUpdateExploreConfig()
  const dismissProject = useDismissExploreProject()

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
  const [didHydrateCities, setDidHydrateCities] = useState(false)
  const [cityQuery, setCityQuery] = useState('')

  const initialCityIds = profile?.viewer.exploreConfig.cityIds.length
    ? profile.viewer.exploreConfig.cityIds.map(String)
    : profile?.viewer.cityId
      ? [String(profile.viewer.cityId)]
      : []

  useEffect(() => {
    if (didHydrateCities) return

    setSelectedCityIds(initialCityIds)
    setDidHydrateCities(true)
  }, [didHydrateCities, initialCityIds])

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

  const allItems = (feedQuery.data as Array<Doc<'projects'>> | undefined) ?? []
  const items = allItems.filter((item) => !dismissedIds.has(String(item._id)))
  const selectedCities =
    (selectedCitiesQuery.data as Array<Doc<'cities'>> | undefined) ?? []
  const cityResults =
    cityQuery.trim().length > 0
      ? ((citySearchResultsQuery.data as Array<Doc<'cities'>> | undefined) ??
        [])
      : ((popularCitiesQuery.data as Array<Doc<'cities'>> | undefined) ?? [])
  const isLoading = feedQuery.isLoading || profileQuery.isLoading

  const persistExploreConfig = async (nextCityIds: string[]) => {
    if (!profile) return

    await updateExploreConfig({
      cityIds: nextCityIds as never[],
      stackPrefs: profile.viewer.exploreConfig.stackPrefs,
      appearInExplore: profile.viewer.appearInExplore,
    })
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
      v: `${selectedCityIds.length || 1}`,
    },
    { l: 'available now', v: `${items.length} repos` },
    { l: 'dismissed', v: `${dismissedIds.size}` },
  ]

  return (
    <div
      className="lx-page-shell xl:flex-row"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        <header
          style={{
            padding: '20px var(--lx-gutter)',
            borderBottom: '1px solid var(--lx-border)',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: 'var(--lx-font-mono)',
                  fontSize: 11,
                  color: 'var(--lx-text-3)',
                  marginBottom: 6,
                  textTransform: 'lowercase',
                }}
              >
                // projects we think you'd like
              </div>
              <h1
                style={{
                  margin: 0,
                  fontFamily: 'var(--lx-font-mono)',
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  color: 'var(--lx-text)',
                }}
              >
                explore
              </h1>
            </div>
            <div
              className="lx-chip-wrap"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                justifyContent: 'flex-start',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--lx-font-mono)',
                  fontSize: 11.5,
                  color: 'var(--lx-text-3)',
                }}
              >
                exploring from
              </span>
              {selectedCities.map((city) => (
                <CityPill
                  key={String(city._id)}
                  city={city.displayName}
                  onRemove={() => {
                    const nextCityIds = selectedCityIds.filter(
                      (cityId) => cityId !== String(city._id),
                    )
                    setSelectedCityIds(nextCityIds)
                    void persistExploreConfig(nextCityIds)
                  }}
                />
              ))}
            </div>
          </div>
        </header>

        <div className="lx-page-scroll">
          <div className="lx-page-width-feed">
            {isLoading && (
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
              >
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

            {!isLoading && !feedQuery.isError && items.length === 0 && (
              <EmptyState
                title="you've seen everything from these cities recently."
                description="add another city to widen your explore graph, or check back later."
              />
            )}

            {!isLoading && items.length > 0 && (
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
              >
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
                      onFollow={() => void handleFollow(ownerId, followed)}
                      onCardClick={() =>
                        void navigate({
                          to: '/project/$owner/$repo',
                          params: { owner, repo } as never,
                        } as never)
                      }
                      likePending={pendingLikes.has(projectId)}
                      followPending={pendingFollows.has(ownerId)}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <aside
        className="hidden xl:flex"
        style={{
          width: 280,
          borderLeft: '1px solid var(--lx-border)',
          padding: '24px var(--lx-gutter)',
          background: 'var(--lx-bg)',
          flexDirection: 'column',
          gap: 24,
          overflowY: 'auto',
          flexShrink: 0,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--lx-font-mono)',
              fontSize: 10.5,
              color: 'var(--lx-text-3)',
              marginBottom: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            why this feed
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {explanationStats.map((stat) => (
              <div key={stat.l}>
                <div
                  style={{
                    fontFamily: 'var(--lx-font-mono)',
                    fontSize: 18,
                    color: 'var(--lx-text)',
                    marginBottom: 2,
                  }}
                >
                  {stat.v}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--lx-font-mono)',
                    fontSize: 11,
                    color: 'var(--lx-text-3)',
                  }}
                >
                  {stat.l}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div
            style={{
              fontFamily: 'var(--lx-font-mono)',
              fontSize: 10.5,
              color: 'var(--lx-text-3)',
              marginBottom: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            add cities
          </div>
          <input
            value={cityQuery}
            onChange={(event) => setCityQuery(event.target.value)}
            placeholder="search a city"
            style={{
              width: '100%',
              border: '1px solid var(--lx-border)',
              borderRadius: 4,
              background: 'var(--lx-surface)',
              color: 'var(--lx-text)',
              padding: '8px 10px',
              fontFamily: 'var(--lx-font-mono)',
              fontSize: 12,
            }}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginTop: 12,
            }}
          >
            {cityResults
              .filter((city) => !selectedCityIds.includes(String(city._id)))
              .slice(0, 6)
              .map((city) => (
                <button
                  key={String(city._id)}
                  onClick={() => {
                    const nextCityIds = [...selectedCityIds, String(city._id)]
                    setSelectedCityIds(nextCityIds)
                    setCityQuery('')
                    void persistExploreConfig(nextCityIds)
                  }}
                  style={{
                    border: '1px dashed var(--lx-border)',
                    background: 'transparent',
                    color: 'var(--lx-text-2)',
                    padding: '8px 10px',
                    borderRadius: 4,
                    fontFamily: 'var(--lx-font-mono)',
                    fontSize: 11.5,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    textAlign: 'left',
                  }}
                  type="button"
                >
                  <span>{city.displayName}</span>
                  <Plus size={11} />
                </button>
              ))}
          </div>
        </div>
      </aside>
    </div>
  )
}
