import { createFileRoute } from '@tanstack/react-router'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { usePaginatedQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { viewerLikedProjectIdsQueryOptions } from '@/features/viewer/queries'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/app-shell/page-header'
import { useLikeProject, useUnlikeProject } from '@/features/projects/mutations'
import {
  type HomeFeedItem,
  updateLikedProjectIdsPayload,
} from '@/features/home/cache'
import { HomeFeedCard } from '@/features/home/home-feed-card'
import {
  mapViewerLikedProjectIds,
  type ViewerLikedProjectIdsPayload,
} from '@/features/contracts'
import {
  FeedRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '@/components/app-shell/route-pending'
import { shouldPrefetchPrivateConvexQueries } from '@/lib/auth-routing'
import { getFreshExploreSearch } from '@/features/explore/state'
import { getHomeFeedRenderState } from '@/features/home/render-state'

export const Route = createFileRoute('/_app/home')({
  loader: ({ context }) => {
    if (!shouldPrefetchPrivateConvexQueries()) {
      return
    }

    return context.queryClient.ensureQueryData(
      viewerLikedProjectIdsQueryOptions(),
    )
  },
  pendingComponent: FeedRoutePending,
  pendingMs: ROUTE_PENDING_MS,
  pendingMinMs: ROUTE_PENDING_MIN_MS,
  component: HomePage,
})

function HomePage() {
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()
  const homeFeed = usePaginatedQuery(api.home.list, {}, { initialNumItems: 20 })
  const { data: viewerStateData } = useSuspenseQuery(
    viewerLikedProjectIdsQueryOptions(),
  )
  const viewerState = mapViewerLikedProjectIds(
    viewerStateData as ViewerLikedProjectIdsPayload | undefined,
  )

  const likeProject = useLikeProject()
  const unlikeProject = useUnlikeProject()

  const [pendingLikes, setPendingLikes] = useState<Set<string>>(new Set())

  const likedProjectIds = new Set(
    viewerState?.likedProjectIds.map(String) ?? [],
  )
  const items = (homeFeed.results ?? []) as HomeFeedItem[]
  const homeFeedRenderState = getHomeFeedRenderState({
    itemCount: items.length,
    status: homeFeed.status,
  })
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
      await queryClient.cancelQueries({ queryKey: likedProjectIdsQueryKey })

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
        likedProjectIdsQueryKey,
        (current: ViewerLikedProjectIdsPayload | undefined) =>
          updateLikedProjectIdsPayload(current, projectId, nextLiked),
      )

      return { previousLikedProjectIds }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(
        likedProjectIdsQueryKey,
        context?.previousLikedProjectIds,
      )
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: likedProjectIdsQueryKey })
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
          {homeFeedRenderState === 'loading' && <HomeFeedSkeletonRows />}

          {homeFeedRenderState === 'empty' && (
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

          {homeFeedRenderState === 'items' && (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <span className="font-mono text-[11.5px] lowercase text-text-faint">
                  {'// activity from people you follow'}
                </span>
              </div>

              <div className="flex flex-col gap-3.5">
                {items.map((item) => (
                  <HomeFeedCard
                    key={String(item._id)}
                    item={item}
                    likedProjectIds={likedProjectIds}
                    pendingLikes={pendingLikes}
                    onLikeProject={(projectId, projectKey) =>
                      void handleLike(projectId, projectKey)
                    }
                  />
                ))}
                {homeFeed.status === 'CanLoadMore' && (
                  <div className="flex justify-center pt-1">
                    <Button
                      type="button"
                      variant="monoOutline"
                      size="meta"
                      onClick={() => homeFeed.loadMore(20)}
                      className="min-h-11 font-mono"
                    >
                      load older activity
                    </Button>
                  </div>
                )}
                {homeFeed.status === 'LoadingMore' && (
                  <div className="py-2 text-center font-mono text-[11.5px] text-text-faint">
                    loading older activity…
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function HomeFeedSkeletonRows() {
  return (
    <div
      role="status"
      aria-label="Loading home feed"
      className="flex flex-col gap-3.5"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="rounded-[6px] border border-line bg-surface px-4 py-4"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-4 w-[min(24rem,78%)]" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-[min(34rem,70%)]" />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-7 w-24 rounded-md" />
            <Skeleton className="h-7 w-16 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  )
}
