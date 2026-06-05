import { createFileRoute } from '@tanstack/react-router'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { useState } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import { homeFeedQueryOptions } from '@/features/home/queries'
import { viewerLikedProjectIdsQueryOptions } from '@/features/viewer/queries'
import { ProjectCard } from '@/components/ui/project-card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/app-shell/page-header'
import { relativeTime } from '@/lib/time'
import { useLikeProject, useUnlikeProject } from '@/features/projects/mutations'
import { showGithubSyncFeedback } from '@/features/projects/github-sync-feedback'
import { useOpenConversation } from '@/features/inbox/use-open-conversation'
import { getHomeCardDmTargetUserId } from '@/features/home/project-card-targets'
import { getHomeFeedActivityLabel } from '@/features/home/activity-labels'
import {
  type HomeFeedPage,
  updateHomeFeedPayload,
  updateLikedProjectIdsPayload,
} from '@/features/home/cache'
import {
  mapViewerLikedProjectIds,
  type ViewerLikedProjectIdsPayload,
} from '@/features/contracts'
import { toProjectCardData } from '@/features/project-card-preview'
import {
  FeedRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '@/components/app-shell/route-pending'
import { shouldPrefetchPrivateConvexQueries } from '@/lib/auth-routing'
import { getFreshExploreSearch } from '@/features/explore/state'

export const Route = createFileRoute('/_app/home')({
  loader: ({ context }) => {
    if (!shouldPrefetchPrivateConvexQueries()) {
      return
    }

    return Promise.all([
      context.queryClient.ensureQueryData(homeFeedQueryOptions()),
      context.queryClient.ensureQueryData(viewerLikedProjectIdsQueryOptions()),
    ])
  },
  pendingComponent: FeedRoutePending,
  pendingMs: ROUTE_PENDING_MS,
  pendingMinMs: ROUTE_PENDING_MIN_MS,
  component: HomePage,
})

function HomePage() {
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()
  const { data: feedData } = useSuspenseQuery(homeFeedQueryOptions())
  const { data: viewerStateData } = useSuspenseQuery(
    viewerLikedProjectIdsQueryOptions(),
  )
  const viewerState = mapViewerLikedProjectIds(
    viewerStateData as ViewerLikedProjectIdsPayload | undefined,
  )

  const likeProject = useLikeProject()
  const unlikeProject = useUnlikeProject()
  const { openConversation, pendingUserId } = useOpenConversation()

  const [pendingLikes, setPendingLikes] = useState<Set<string>>(new Set())

  const likedProjectIds = new Set(
    viewerState?.likedProjectIds.map(String) ?? [],
  )
  const items = (feedData as HomeFeedPage).page
  const homeFeedQueryKey = homeFeedQueryOptions().queryKey
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
    onMutate: async ({ projectId }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: homeFeedQueryKey }),
        queryClient.cancelQueries({ queryKey: likedProjectIdsQueryKey }),
      ])

      const previousFeed =
        queryClient.getQueryData<HomeFeedPage>(homeFeedQueryKey)
      const previousLikedProjectIds =
        queryClient.getQueryData<ViewerLikedProjectIdsPayload>(
          likedProjectIdsQueryKey,
        )
      const cachedLikedProjectIds = new Set(
        previousLikedProjectIds?.likedProjectIds.map(String) ?? [],
      )
      const cachedCurrentlyLiked = cachedLikedProjectIds.has(String(projectId))
      const nextLiked = !cachedCurrentlyLiked

      queryClient.setQueryData(
        homeFeedQueryKey,
        (current: HomeFeedPage | undefined) =>
          updateHomeFeedPayload(
            current,
            String(projectId),
            nextLiked,
            cachedLikedProjectIds,
          ),
      )
      queryClient.setQueryData(
        likedProjectIdsQueryKey,
        (current: ViewerLikedProjectIdsPayload | undefined) =>
          updateLikedProjectIdsPayload(current, projectId, nextLiked),
      )

      return { previousFeed, previousLikedProjectIds }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(homeFeedQueryKey, context?.previousFeed)
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
        queryClient.invalidateQueries({ queryKey: homeFeedQueryKey }),
        queryClient.invalidateQueries({ queryKey: likedProjectIdsQueryKey }),
      ])
    },
  })

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

  return (
    <div className="lx-page-shell">
      <PageHeader title="home" />

      <div className="lx-page-scroll" data-scroll-restoration-id="home-feed">
        <div className="lx-page-width-feed">
          {items.length === 0 && (
            <EmptyState
              title="you're not following anyone yet."
              description="your feed shows activity from people you follow. start with explore to find builders nearby."
              action={{
                label: 'go to explore',
                onClick: () =>
                  void navigate({
                    to: '/explore',
                    search: getFreshExploreSearch(),
                  }),
              }}
            />
          )}

          {items.length > 0 && (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <span className="font-mono text-[11.5px] lowercase text-text-faint">
                  {'// activity from people you follow'}
                </span>
              </div>

              <div className="flex flex-col gap-3.5">
                {items.map((item) => {
                  const snapshot = item.projectSnapshot
                  const owner = snapshot.ownerLogin
                  const repo = snapshot.name
                  const projectId = item.projectId
                  const projectIdKey = String(item.projectId)
                  const activityLabel = getHomeFeedActivityLabel({
                    actorDisplayName: item.actorSnapshot.displayName,
                    eventType: item.eventType,
                  })
                  const dmTargetUserId = getHomeCardDmTargetUserId({
                    actorUserId: item.actorId,
                    ownerUserId: snapshot.ownerId,
                    viewerUserId: viewerState?.viewerId ?? null,
                  })
                  const liked = likedProjectIds.has(projectIdKey)
                  const project = item.project
                  const cardData = item.projectPreview
                    ? {
                        ...toProjectCardData(item.projectPreview),
                        liked,
                      }
                    : {
                        id: projectIdKey,
                        owner,
                        repo,
                        fullName: snapshot.fullName,
                        description: snapshot.description,
                        lang:
                          project?.github.primaryLanguage ??
                          snapshot.primaryLanguage,
                        languages:
                          project?.github.languages ?? snapshot.languages ?? [],
                        lastCommitLabel: undefined,
                        githubStars:
                          project?.github.stargazersCount ??
                          snapshot.stargazersCount,
                        locaticLikes:
                          project?.locatic.likesCount ?? snapshot.likesCount,
                        commentsCount:
                          project?.locatic.commentsCount ??
                          snapshot.commentsCount,
                        authorName: snapshot.ownerDisplayName,
                        authorHandle: owner,
                        authorAvatarUrl: snapshot.ownerAvatarUrl,
                        city: snapshot.cityName,
                        liked,
                      }

                  return (
                    <div key={String(item._id)}>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                        <span className="font-mono text-[11px] text-text-faint">
                          {activityLabel}
                        </span>
                        <span className="font-mono text-[10.5px] text-text-faint">
                          {relativeTime(item.createdAt)}
                        </span>
                      </div>
                      <ProjectCard
                        project={cardData}
                        onLike={() => void handleLike(projectId, projectIdKey)}
                        authorLink={{ username: cardData.authorHandle }}
                        projectLink={{ owner, repo }}
                        onDM={
                          dmTargetUserId
                            ? () => void openConversation(dmTargetUserId)
                            : undefined
                        }
                        likePending={pendingLikes.has(projectIdKey)}
                        dmPending={
                          dmTargetUserId
                            ? pendingUserId === String(dmTargetUserId)
                            : false
                        }
                      />
                    </div>
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
