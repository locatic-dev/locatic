import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { Doc } from '../../../convex/_generated/dataModel'
import { homeFeedQueryOptions } from '@/features/home/queries'
import { privateProfileQueryOptions } from '@/features/profile/queries'
import { followingQueryOptions } from '@/features/follows/queries'
import {
  ProjectCard,
  ProjectCardSkeleton,
  type ProjectCardData,
} from '@/components/ui/project-card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/app-shell/page-header'
import { relativeTime } from '@/lib/time'
import { useLikeProject, useUnlikeProject } from '@/features/projects/mutations'
import { useFollowUser, useUnfollowUser } from '@/features/follows/mutations'
import {
  mapPrivateProfile,
  type PrivateProfilePayload,
} from '@/features/contracts'

export const Route = createFileRoute('/_app/home')({
  component: HomePage,
})

function HomePage() {
  const navigate = useNavigate()
  const feedQuery = useQuery(homeFeedQueryOptions())
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

  const [pendingLikes, setPendingLikes] = useState<Set<string>>(new Set())
  const [pendingFollows, setPendingFollows] = useState<Set<string>>(new Set())
  const [likedOverrides, setLikedOverrides] = useState<Record<string, boolean>>(
    {},
  )
  const [followOverrides, setFollowOverrides] = useState<
    Record<string, boolean>
  >({})

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
    | { items: Array<Doc<'home_feed_items'>>; nextCursor: number | null }
    | undefined
  const items = feedData?.items ?? []
  const isLoading = feedQuery.isLoading || profileQuery.isLoading

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

  return (
    <div className="lx-page-shell">
      <PageHeader
        title="home"
        actions={
          <button
            className="lx-touch-target"
            style={{
              border: '1px solid var(--lx-border)',
              background: 'transparent',
              padding: '6px 12px',
              borderRadius: 4,
              color: 'var(--lx-text)',
              fontFamily: 'var(--lx-font-mono)',
              fontSize: 11.5,
              cursor: 'pointer',
            }}
            type="button"
          >
            + share project
          </button>
        }
      />

      <div className="lx-page-scroll">
        <div className="lx-page-width-feed">
          {isLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[1, 2, 3].map((skeletonId) => (
                <ProjectCardSkeleton key={skeletonId} />
              ))}
            </div>
          )}

          {feedQuery.isError && (
            <EmptyState
              title="could not load your feed"
              description="something went wrong fetching your feed. try again."
              action={{
                label: 'retry',
                onClick: () => void feedQuery.refetch(),
              }}
            />
          )}

          {!isLoading && !feedQuery.isError && items.length === 0 && (
            <EmptyState
              title="you're not following anyone yet."
              description="your feed shows projects from people you follow. start with explore to find builders nearby."
              action={{
                label: 'go to explore',
                onClick: () =>
                  void navigate({
                    to: '/explore',
                    search: {} as never,
                  } as never),
              }}
            />
          )}

          {!isLoading && items.length > 0 && (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  marginBottom: 16,
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--lx-font-mono)',
                    fontSize: 11.5,
                    color: 'var(--lx-text-3)',
                    textTransform: 'lowercase',
                  }}
                >
                  {'// from people you follow'}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--lx-font-mono)',
                    fontSize: 11,
                    color: 'var(--lx-text-3)',
                  }}
                >
                  {items[0]?.createdAt ? relativeTime(items[0].createdAt) : ''}
                </span>
              </div>

              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
              >
                {items.map((item) => {
                  const snapshot = item.projectSnapshot
                  const actorId = String(item.actorId)
                  const owner = snapshot.fullName.split('/')[0] ?? ''
                  const repo = snapshot.name
                  const projectId = String(item.projectId)
                  const liked =
                    likedOverrides[projectId] ?? likedProjectIds.has(projectId)
                  const followed =
                    followOverrides[actorId] ?? followedUserIds.has(actorId)

                  const cardData: ProjectCardData = {
                    id: projectId,
                    owner,
                    repo,
                    fullName: snapshot.fullName,
                    description: snapshot.description,
                    lang: snapshot.primaryLanguage,
                    lastCommitLabel: undefined,
                    githubStars: snapshot.stargazersCount,
                    locaticLikes: snapshot.likesCount,
                    commentsCount: snapshot.commentsCount,
                    authorName: snapshot.ownerDisplayName,
                    authorHandle: owner,
                    authorAvatarUrl: snapshot.ownerAvatarUrl,
                    city: snapshot.cityName,
                    liked,
                    followed,
                  }

                  return (
                    <ProjectCard
                      key={String(item._id)}
                      project={cardData}
                      onLike={() => void handleLike(projectId, liked)}
                      onFollow={() => void handleFollow(actorId, followed)}
                      onCardClick={() =>
                        void navigate({
                          to: '/project/$owner/$repo',
                          params: { owner, repo } as never,
                        } as never)
                      }
                      likePending={pendingLikes.has(projectId)}
                      followPending={pendingFollows.has(actorId)}
                    />
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
