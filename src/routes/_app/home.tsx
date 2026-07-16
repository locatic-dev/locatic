import { createFileRoute } from '@tanstack/react-router'
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { usePaginatedQuery } from 'convex/react'
import * as m from 'motion/react-m'
import { useRef, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { viewerLikedProjectIdsQueryOptions } from '@/features/viewer/queries'
import { homeFeedQueryOptions } from '@/integrations/convex/query-options'
import { Button } from '@/components/ui/button'
import { CardSheet, cardSheetClass } from '@/components/ui/card-sheet'
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
import { getResumeExploreSearch } from '@/features/explore/state'
import {
  getHomeFeedHandoffState,
  getHomeFeedRenderState,
} from '@/features/home/render-state'
import { fadeUp, listStagger } from '@/lib/motion'

export const Route = createFileRoute('/_app/home')({
  loader: async ({ context }) => {
    if (!shouldPrefetchPrivateConvexQueries()) {
      return
    }

    // SSR-render the first feed page (and viewer like state) so the home feed
    // shows real content on first paint instead of a skeleton. The live
    // `usePaginatedQuery` resumes from here after hydration.
    await Promise.all([
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
  // SSR-rendered first page — resolved on first paint (prefetched in the loader).
  const { data: firstPageData } = useSuspenseQuery(homeFeedQueryOptions())
  // Live feed for "load older" and post-hydration freshness.
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
  const ssrItems = ((firstPageData as { page?: Array<unknown> } | undefined)
    ?.page ?? []) as HomeFeedItem[]
  const paginatedItems = (homeFeed.results ?? []) as HomeFeedItem[]
  const { items, status: renderStatus } = getHomeFeedHandoffState({
    paginatedItems,
    ssrItems,
    status: homeFeed.status,
  })
  const homeFeedRenderState = getHomeFeedRenderState({
    itemCount: items.length,
    status: renderStatus,
  })
  // First page entrance animation only: capture the item ids present the
  // first time the feed has content, then never animate items outside that
  // set — covers pagination appends and live Convex refetches.
  const initialItemIdsRef = useRef<Set<string> | null>(null)
  if (initialItemIdsRef.current === null && items.length > 0) {
    initialItemIdsRef.current = new Set(items.map((item) => String(item._id)))
  }
  const initialItemIds = initialItemIdsRef.current ?? new Set<string>()

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
          <div className="w-full min-w-0">
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
                      search: getResumeExploreSearch(),
                    }),
                }}
              />
            )}

            {homeFeedRenderState === 'items' && (
              <>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <span className="font-mono text-[11.5px] lowercase text-text-muted">
                    {'// activity from people you follow'}
                  </span>
                </div>

                <m.div
                  className={cardSheetClass}
                  variants={listStagger}
                  initial="hidden"
                  animate="visible"
                >
                  {items.map((item) => {
                    const itemId = String(item._id)
                    const card = (
                      <HomeFeedCard
                        item={item}
                        likedProjectIds={likedProjectIds}
                        pendingLikes={pendingLikes}
                        onLikeProject={(projectId, projectKey) =>
                          void handleLike(projectId, projectKey)
                        }
                        className="rounded-none border-0"
                      />
                    )

                    // Only the first page's items get the entrance animation —
                    // pagination appends and live refetches render plain.
                    return initialItemIds.has(itemId) ? (
                      <m.div key={itemId} variants={fadeUp}>
                        {card}
                      </m.div>
                    ) : (
                      <div key={itemId}>{card}</div>
                    )
                  })}
                </m.div>
                {homeFeed.status === 'CanLoadMore' && (
                  <div className="mt-4 flex justify-center">
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
                  <div className="py-2 text-center font-mono text-[11.5px] text-text-muted">
                    loading older activity…
                  </div>
                )}
              </>
            )}
          </div>

          {/* Pulse side rail intentionally hidden until the Home dashboard model is clearer. */}
        </div>
      </div>
    </div>
  )
}

function HomeFeedSkeletonRows() {
  return (
    <CardSheet role="status" aria-label="Loading home feed">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="bg-surface">
          {/* Header: avatar + actor summary, matches HomeFeedCard header */}
          <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-[min(20rem,78%)]" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          </div>
          {/* Target row: icon tile + repo/description lines */}
          <div className="flex min-h-14 items-center gap-3 border-t border-line px-4 py-3 sm:px-5">
            <Skeleton className="size-8 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-[min(16rem,60%)]" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        </div>
      ))}
    </CardSheet>
  )
}
