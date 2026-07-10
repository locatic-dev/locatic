import { createFileRoute } from '@tanstack/react-router'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import { notificationsQueryOptions } from '@/features/notifications/queries'
import {
  useBackfillNotificationTargets,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from '@/features/notifications/mutations'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { fadeUp, listStagger } from '@/lib/motion'
import { relativeTime } from '@/lib/time'
import { Bell, Heart, MessageSquare, UserPlus } from '@/lib/icons'
import { mapNotifications, type NotificationRecord } from '@/features/contracts'
import type { Doc } from '../../../convex/_generated/dataModel'
import {
  FeedRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '@/components/app-shell/route-pending'
import { getNotificationDestination } from '@/features/notifications/navigation'
import {
  projectDetailQueryOptions,
  publicProfileOverviewQueryOptions,
} from '@/integrations/convex/query-options'

export const Route = createFileRoute('/_app/notifications')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(notificationsQueryOptions()),
  pendingComponent: FeedRoutePending,
  pendingMs: ROUTE_PENDING_MS,
  pendingMinMs: ROUTE_PENDING_MIN_MS,
  component: NotificationsPage,
})

function notifIcon(type: string) {
  if (type === 'project_liked') {
    return <Heart size={14} className="text-brand" fill="currentColor" />
  }
  if (type === 'project_commented' || type === 'comment_replied') {
    return <MessageSquare size={14} className="text-text-muted" />
  }
  if (type === 'followed') {
    return <UserPlus size={14} className="text-text-muted" />
  }
  return <Bell size={14} className="text-text-muted" />
}

function notifText(notification: Doc<'notifications'>) {
  if (notification.type === 'project_liked') {
    return `liked your project ${notification.projectName ? `"${notification.projectName}"` : ''}`
  }
  if (notification.type === 'project_commented') {
    return `commented on ${notification.projectName ? `"${notification.projectName}"` : 'your project'}`
  }
  if (notification.type === 'comment_replied') {
    return `replied to your comment`
  }
  if (notification.type === 'followed') {
    return 'started following you'
  }
  if (notification.type === 'dm_received') {
    return 'sent you a message'
  }

  return 'did something'
}

function NotificationsPage() {
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()
  const { data } = useSuspenseQuery(notificationsQueryOptions())
  const backfillTargets = useBackfillNotificationTargets()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const [localReadIds, setLocalReadIds] = useState<Set<string>>(new Set())
  const [markingAll, setMarkingAll] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const notificationsPage = data as
    | {
        page: Array<NotificationRecord>
        continueCursor: string
        isDone: boolean
      }
    | undefined
  const notifications = mapNotifications(notificationsPage?.page) ?? []
  const unreadCount = notifications.filter(
    (notification) =>
      !notification.isRead && !localReadIds.has(String(notification._id)),
  ).length

  // Entrance stagger plays once for the first page only; ids loaded via
  // "load more" render without replaying the stagger/fadeUp entrance.
  const initialNotificationIdsRef = useRef<Set<string> | null>(null)
  if (initialNotificationIdsRef.current === null) {
    initialNotificationIdsRef.current = new Set(
      notifications.map((notification) => String(notification._id)),
    )
  }

  useEffect(() => {
    const needsBackfill = notifications.some(
      (notification) =>
        !notification.target ||
        (notification.target.kind === 'conversation' &&
          notification.target.inboxTab === undefined),
    )

    if (!needsBackfill) {
      return
    }

    void backfillTargets({})
  }, [backfillTargets, notifications])

  const handleMarkAll = async () => {
    if (markingAll) return
    setMarkingAll(true)

    try {
      await markAllRead({})
      setLocalReadIds(
        new Set(notifications.map((notification) => String(notification._id))),
      )
    } catch (error) {
      console.error('Mark all failed', error)
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

  const handleLoadMore = async () => {
    if (loadingMore || notificationsPage?.isDone) {
      return
    }

    setLoadingMore(true)
    try {
      const nextPage = (await queryClient.fetchQuery(
        notificationsQueryOptions({
          cursor: notificationsPage?.continueCursor ?? null,
          numItems: 20,
        }),
      )) as {
        page: Array<NotificationRecord>
        continueCursor: string
        isDone: boolean
      }

      queryClient.setQueryData(
        notificationsQueryOptions().queryKey,
        (
          current:
            | {
                page: Array<NotificationRecord>
                continueCursor: string
                isDone: boolean
              }
            | undefined,
        ) => ({
          ...nextPage,
          page: [...(current?.page ?? []), ...nextPage.page],
        }),
      )
    } catch (error) {
      console.error('Load notifications failed', error)
    } finally {
      setLoadingMore(false)
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
      <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-(--lx-gutter)">
        <h1 className="m-0 font-mono text-sm font-semibold text-text">
          notifications
        </h1>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            onClick={() => void handleMarkAll()}
            disabled={markingAll}
            className="font-mono text-[11.5px] text-text-muted hover:text-text"
          >
            mark all read
          </Button>
        )}
      </div>

      <div className="lx-page-scroll flex-1">
        <div className="lx-page-width-feed">
          {notifications.length === 0 && (
            <EmptyState
              icon={<Bell size={32} strokeWidth={1.2} />}
              title="no notifications yet"
              description="likes, comments, follows, and replies on your work will show up here."
            />
          )}

          <motion.div variants={listStagger} initial="hidden" animate="visible">
            {notifications.map((notification) => {
              const notificationId = String(notification._id)
              const isRead =
                notification.isRead || localReadIds.has(notificationId)
              const isInitialItem =
                initialNotificationIdsRef.current?.has(notificationId) ?? false

              const row = (
                <button
                  className={`flex w-full items-start gap-3 border-b border-line px-3 py-4 text-left transition-colors active:scale-[0.99] hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
                  onClick={() => void handleNotificationClick(notification)}
                  onFocus={() => prefetchNotificationDestination(notification)}
                  onPointerEnter={() =>
                    prefetchNotificationDestination(notification)
                  }
                  onTouchStart={() =>
                    prefetchNotificationDestination(notification)
                  }
                  type="button"
                >
                  <div className="relative shrink-0">
                    <LxAvatar
                      name={notification.actorSnapshot.displayName}
                      avatarUrl={notification.actorSnapshot.avatarUrl}
                      size={36}
                    />
                    <div className="absolute -right-0.5 -bottom-0.5 flex size-4.5 items-center justify-center rounded-full border border-line bg-surface">
                      {notifIcon(notification.type)}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`m-0 font-sans text-[13.5px] leading-6 wrap-anywhere ${
                        isRead ? 'text-text-muted' : 'text-text'
                      }`}
                    >
                      <strong className="font-mono font-semibold text-text">
                        {notification.actorSnapshot.displayName}
                      </strong>{' '}
                      {notifText(notification)}
                    </p>
                    <span className="mt-1 block font-mono text-[11px] text-text-faint">
                      {relativeTime(notification.createdAt)}
                    </span>
                  </div>
                  <span
                    aria-hidden
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${
                      isRead ? 'bg-transparent' : 'bg-unread'
                    }`}
                  />
                </button>
              )

              if (!isInitialItem) {
                return <div key={notificationId}>{row}</div>
              }

              return (
                <motion.div key={notificationId} variants={fadeUp}>
                  {row}
                </motion.div>
              )
            })}
          </motion.div>

          {loadingMore && (
            <div className="flex flex-col gap-0">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 border-b border-line px-3 py-4"
                >
                  <Skeleton className="size-9 shrink-0 rounded-avatar" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-4/5 max-w-72" />
                    <Skeleton className="h-2.5 w-16" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!notificationsPage?.isDone && (
            <div className="py-5 text-center">
              <Button
                variant="monoOutline"
                size="meta"
                onClick={() => void handleLoadMore()}
                disabled={loadingMore}
                className="font-mono"
              >
                {loadingMore ? 'loading…' : 'load more'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
