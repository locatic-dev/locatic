import { createFileRoute } from '@tanstack/react-router'
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { usePaginatedQuery } from 'convex/react'
import * as m from 'motion/react-m'
import { useRef, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import {
  notificationsQueryOptions,
  notificationsUnreadCountQueryOptions,
} from '@/features/notifications/queries'
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from '@/features/notifications/mutations'
import { formatUnreadCount } from '@/lib/format'
import { NotificationRow } from '@/features/notifications/components/notification-row'
import { getNotificationsListState } from '@/features/notifications/pagination'
import { PageHeader } from '@/components/app-shell/page-header'
import { Button } from '@/components/ui/button'
import { cardSheetClass } from '@/components/ui/card-sheet'
import { EmptyState } from '@/components/ui/empty-state'
import { fadeUp, listStagger } from '@/lib/motion'
import { reportActionError } from '@/lib/action-error'
import { Bell } from '@/lib/icons'
import { mapNotifications, type NotificationRecord } from '@/features/contracts'
import {
  NotificationRowSkeleton,
  NotificationsRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '@/components/app-shell/route-pending'
import { getNotificationDestination } from '@/features/notifications/navigation'
import {
  projectDetailQueryOptions,
  publicProfileOverviewQueryOptions,
} from '@/integrations/convex/query-options'
import { shouldPrefetchPrivateConvexQueries } from '@/lib/auth-routing'
import { seo } from '@/lib/seo'

/** Matches the page `notificationsQueryOptions()` renders on the server. */
const NOTIFICATIONS_PAGE_SIZE = 20

export const Route = createFileRoute('/_app/notifications')({
  loader: async ({ context }) => {
    // Client navigations fetch in the page, once Convex auth is ready.
    if (!shouldPrefetchPrivateConvexQueries()) {
      return
    }

    await context.queryClient.ensureQueryData(notificationsQueryOptions())
  },
  pendingComponent: NotificationsRoutePending,
  pendingMs: ROUTE_PENDING_MS,
  pendingMinMs: ROUTE_PENDING_MIN_MS,
  head: () => seo({ title: 'notifications', noindex: true }),
  component: NotificationsPage,
})

function NotificationsPage() {
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()
  // SSR-rendered first page (prefetched in the loader) for the first paint.
  const { data: firstPageData } = useSuspenseQuery(notificationsQueryOptions())
  // Live list: keeps every loaded page and merges new notifications in place.
  const liveNotifications = usePaginatedQuery(
    api.notifications.list,
    {},
    { initialNumItems: NOTIFICATIONS_PAGE_SIZE },
  )
  // The badge query: the sidebar and tab bar read the same count.
  const { data: unreadCountData } = useQuery(
    notificationsUnreadCountQueryOptions(),
  )
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const [localReadIds, setLocalReadIds] = useState<Set<string>>(new Set())
  const [markingAll, setMarkingAll] = useState(false)

  const ssrNotifications =
    mapNotifications(
      (firstPageData as { page?: Array<NotificationRecord> } | undefined)?.page,
    ) ?? []
  const {
    items: notifications,
    canLoadMore,
    loadingMore,
  } = getNotificationsListState({
    liveItems: (liveNotifications.results ?? []) as Array<NotificationRecord>,
    ssrItems: ssrNotifications,
    status: liveNotifications.status,
  })
  const unreadCount = typeof unreadCountData === 'number' ? unreadCountData : 0

  // Entrance stagger plays once for the first page only; rows added later by
  // "load more" or a live update render without replaying the entrance.
  const initialNotificationIdsRef = useRef<Set<string> | null>(null)
  if (initialNotificationIdsRef.current === null) {
    initialNotificationIdsRef.current = new Set(
      notifications.map((notification) => String(notification._id)),
    )
  }

  const handleMarkAll = async () => {
    if (markingAll) return
    setMarkingAll(true)

    try {
      await markAllRead({})
      setLocalReadIds(
        new Set(notifications.map((notification) => String(notification._id))),
      )
    } catch (error) {
      reportActionError(error, {
        title: "couldn't mark all read",
        retry: handleMarkAll,
      })
    } finally {
      setMarkingAll(false)
    }
  }

  const handleMarkRead = async (notificationId: Id<'notifications'>) => {
    const notificationKey = String(notificationId)
    if (localReadIds.has(notificationKey)) {
      return
    }

    setLocalReadIds((current) => new Set(current).add(notificationKey))

    try {
      await markRead({ notificationId })
    } catch (error) {
      console.error('Mark read failed', error)
      setLocalReadIds((current) => {
        const next = new Set(current)
        next.delete(notificationKey)
        return next
      })
    }
  }

  const handleNotificationClick = async (notification: NotificationRecord) => {
    void handleMarkRead(notification._id)

    const destination = getNotificationDestination(notification.target)
    if (!destination) {
      return
    }

    if (destination.to === '/u/$username') {
      void navigate({
        to: destination.to,
        params: destination.params,
        search: destination.search,
      })
      return
    }

    if (destination.to === '/project/$owner/$repo') {
      void navigate({
        to: destination.to,
        params: destination.params,
        search: destination.search,
      })
      return
    }

    if (destination.to === '/inbox') {
      void navigate({
        to: destination.to,
        search: destination.search,
      })
    }
  }

  const prefetchNotificationDestination = (
    notification: NotificationRecord,
  ) => {
    const destination = getNotificationDestination(notification.target)
    if (!destination) {
      return
    }

    if (destination.to === '/project/$owner/$repo') {
      void queryClient.prefetchQuery(
        projectDetailQueryOptions(destination.params),
      )
      return
    }

    if (destination.to === '/u/$username') {
      void queryClient.prefetchQuery(
        publicProfileOverviewQueryOptions(destination.params.username),
      )
    }
  }

  return (
    <div className="lx-page-shell">
      <PageHeader
        title="notifications"
        actions={
          unreadCount > 0 ? (
            <>
              <span className="font-mono text-meta text-text-muted">
                {formatUnreadCount(unreadCount)} unread
              </span>
              <Button
                variant="ghost"
                size="touch"
                onClick={() => void handleMarkAll()}
                disabled={markingAll}
              >
                mark all read
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="lx-page-scroll flex-1">
        <div className="lx-page-width-feed">
          {notifications.length === 0 && !canLoadMore && !loadingMore && (
            <EmptyState
              icon={<Bell size={32} strokeWidth={1.2} />}
              title="no notifications yet"
              description="likes, comments, follows, and replies on your work will show up here."
            />
          )}

          {(notifications.length > 0 || loadingMore) && (
            <m.div
              className={cardSheetClass}
              variants={listStagger}
              initial="hidden"
              animate="visible"
            >
              {notifications.map((notification) => {
                const notificationId = String(notification._id)
                const row = (
                  <NotificationRow
                    notification={notification}
                    isRead={
                      notification.isRead || localReadIds.has(notificationId)
                    }
                    onOpen={() => void handleNotificationClick(notification)}
                    onPrefetch={() =>
                      prefetchNotificationDestination(notification)
                    }
                  />
                )

                if (!initialNotificationIdsRef.current?.has(notificationId)) {
                  return <div key={notificationId}>{row}</div>
                }

                return (
                  <m.div key={notificationId} variants={fadeUp}>
                    {row}
                  </m.div>
                )
              })}
              {loadingMore && (
                <div role="status" aria-label="loading more notifications">
                  {Array.from({ length: 3 }, (_, index) => (
                    <NotificationRowSkeleton key={index} />
                  ))}
                </div>
              )}
            </m.div>
          )}

          {canLoadMore && (
            <div className="py-5 text-center">
              <Button
                size="meta"
                onClick={() =>
                  liveNotifications.loadMore(NOTIFICATIONS_PAGE_SIZE)
                }
              >
                load more
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
