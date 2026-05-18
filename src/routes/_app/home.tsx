import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { Doc } from '../../../convex/_generated/dataModel'
import { homeFeedQueryOptions } from '@/features/home/queries'
import { privateProfileQueryOptions } from '@/features/profile/queries'
import {
  ProjectCard,
  ProjectCardSkeleton,
  type ProjectCardData,
} from '@/components/ui/project-card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/app-shell/page-header'
import { relativeTime } from '@/lib/time'
import { useLikeProject, useUnlikeProject } from '@/features/projects/mutations'
import { useOpenConversation } from '@/features/inbox/use-open-conversation'
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

  const likeProject = useLikeProject()
  const unlikeProject = useUnlikeProject()
  const { openConversation, pendingUserId } = useOpenConversation()

  const [pendingLikes, setPendingLikes] = useState<Set<string>>(new Set())
  const [likedOverrides, setLikedOverrides] = useState<Record<string, boolean>>(
    {},
  )

  const likedProjectIds = new Set(
    profile?.likedProjects.map((likedProject) =>
      String(likedProject.projectId),
    ) ?? [],
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

  return (
    <div className="lx-page-shell">
      <PageHeader title="home" />

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
                  const owner = snapshot.fullName.split('/')[0] ?? ''
                  const repo = snapshot.name
                  const projectId = String(item.projectId)
                  const actorUserId = String(item.actorId)
                  const liked =
                    likedOverrides[projectId] ?? likedProjectIds.has(projectId)

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
                  }

                  return (
                    <ProjectCard
                      key={String(item._id)}
                      project={cardData}
                      onLike={() => void handleLike(projectId, liked)}
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
                      onDM={
                        profile?.viewer.id !== actorUserId
                          ? () => void openConversation(actorUserId)
                          : undefined
                      }
                      likePending={pendingLikes.has(projectId)}
                      dmPending={pendingUserId === actorUserId}
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
