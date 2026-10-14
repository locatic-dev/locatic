import {
  createFileRoute,
  useRouter,
  type ErrorComponentProps,
} from '@tanstack/react-router'
import {
  useMutation,
  useQuery,
  useQueryClient,
  useQueryErrorResetBoundary,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { usePaginatedQuery } from 'convex/react'
import * as m from 'motion/react-m'
import { useRef, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { viewerLikedProjectIdsQueryOptions } from '@/features/viewer/queries'
import {
  homeFeedQueryOptions,
  viewerQueryOptions,
} from '@/integrations/convex/query-options'
import { Button } from '@/components/ui/button'
import { cardSheetClass } from '@/components/ui/card-sheet'
import { PageHeader } from '@/components/app-shell/page-header'
import { useLikeProject, useUnlikeProject } from '@/features/projects/mutations'
import {
  type HomeFeedItem,
  updateLikedProjectIdsPayload,
} from '@/features/home/cache'
import {
  HomeFeedCard,
  hasRenderableHomeFeedTarget,
} from '@/features/home/home-feed-card'
import {
  HomeFeedStatus,
  HomeNearbyBuildersSection,
} from '@/features/home/home-feed-status'
import { HomeNearbyBuilders } from '@/features/home/home-nearby-builders'
import {
  homeNearbyBuildersQueryOptions,
  type HomeNearbyBuilder,
} from '@/features/home/queries'
import {
  mapViewerLikedProjectIds,
  type ViewerBootstrapPayload,
  type ViewerLikedProjectIdsPayload,
} from '@/features/contracts'
import {
  FeedRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '@/components/app-shell/route-pending'
import { shouldPrefetchPrivateConvexQueries } from '@/lib/auth-routing'
import { reportActionError } from '@/lib/action-error'
import { getResumeExploreSearch } from '@/features/explore/state'
import {
  getHomeFeedHandoffState,
  getHomeFeedState,
} from '@/features/home/render-state'
import { fadeUp, listStagger } from '@/lib/motion'
import { seo } from '@/lib/seo'

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
  errorComponent: HomeErrorPage,
  head: () => seo({ title: 'home', noindex: true }),
  component: HomePage,
})

function useExploreNavigation() {
  const navigate = Route.useNavigate()
  return () =>
    void navigate({ to: '/explore', search: getResumeExploreSearch() })
}

/** Persistent recovery block when the feed query fails (A5 contract). */
function HomeErrorPage({ reset }: ErrorComponentProps) {
  const router = useRouter()
  const queryErrorResetBoundary = useQueryErrorResetBoundary()
  const goToExplore = useExploreNavigation()

  return (
    <div className="lx-page-shell">
      <PageHeader title="home" />
      <div className="lx-page-scroll">
        <div className="lx-page-width-feed">
          <HomeFeedStatus
            state={{ kind: 'error' }}
            onExplore={goToExplore}
            onRetry={() => {
              // Clear React Query's error first: otherwise the suspense query
              // rethrows its cached error on remount instead of refetching.
              queryErrorResetBoundary.reset()
              reset()
              void router.invalidate()
            }}
          />
        </div>
      </div>
    </div>
  )
}

function HomePage() {
  const goToExplore = useExploreNavigation()
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
  // Prefetched by the `_app` loader; the stored counter follow/unfollow keep.
  const { data: viewerBootstrap } = useSuspenseQuery(viewerQueryOptions())
  const bootstrapViewer = (
    viewerBootstrap as ViewerBootstrapPayload | undefined
  )?.viewer
  const followingCount = bootstrapViewer?.stats.followingCount ?? 0
  const viewerCityId = bootstrapViewer?.profile.cityId ?? null

  const likeProject = useLikeProject()
  const unlikeProject = useUnlikeProject()

  const [pendingLikes, setPendingLikes] = useState<Set<string>>(new Set())

  const likedProjectIds = new Set(
    viewerState?.likedProjectIds.map(String) ?? [],
  )
  const ssrItems = ((firstPageData as { page?: Array<unknown> } | undefined)
    ?.page ?? []) as HomeFeedItem[]
  const paginatedItems = (homeFeed.results ?? []) as HomeFeedItem[]
  const { items: handoffItems } = getHomeFeedHandoffState({
    paginatedItems,
    ssrItems,
    status: homeFeed.status,
  })
  const items = handoffItems.filter(hasRenderableHomeFeedTarget)
  const homeFeedState = getHomeFeedState({
    followingCount,
    itemCount: items.length,
  })
  // "Builders near you" for a member who arrives following no one, from the
  // viewer's city; nothing without a city (C5 state copy, C4 city links).
  // Decided once per visit: the first follow changes the feed state, and the
  // list must stay so they can follow more than one builder.
  const [suggestNearbyBuilders] = useState(
    () => homeFeedState.kind === 'noFollows',
  )
  const nearbyBuildersQuery = useQuery(
    homeNearbyBuildersQueryOptions(suggestNearbyBuilders ? viewerCityId : null),
  )
  const nearbyBuilders =
    (nearbyBuildersQuery.data as HomeNearbyBuilder[] | undefined) ?? []
  const nearbyBuildersList =
    nearbyBuilders.length > 0 ? (
      <HomeNearbyBuilders builders={nearbyBuilders} />
    ) : undefined
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
      reportActionError(error, {
        title: "couldn't update your like",
        retry: () => handleLike(projectId, projectKey),
      })
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
            {homeFeedState.kind !== 'ready' ? (
              <HomeFeedStatus
                state={homeFeedState}
                onExplore={goToExplore}
                nearbyBuilders={nearbyBuildersList}
              />
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <span className="font-mono text-label lowercase text-text-muted">
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
                      size="touch"
                      onClick={() => homeFeed.loadMore(20)}
                    >
                      load older activity
                    </Button>
                  </div>
                )}
                {homeFeed.status === 'LoadingMore' && (
                  <div className="py-2 text-center font-mono text-label text-text-muted">
                    loading older activity…
                  </div>
                )}
                {nearbyBuildersList ? (
                  <HomeNearbyBuildersSection>
                    {nearbyBuildersList}
                  </HomeNearbyBuildersSection>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
