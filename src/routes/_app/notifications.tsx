import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import { notificationsQueryOptions } from '@/features/notifications/queries'
import {
  useBackfillNotificationTargets,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from '@/features/notifications/mutations'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { Button } from '@/components/ui/button'
import { relativeTime } from '@/lib/time'
import { Bell, Heart, MessageSquare, UserPlus } from '@/lib/icons'
import { mapNotifications, type NotificationRecord } from '@/features/contracts'
import type { Doc } from '../../../convex/_generated/dataModel'
import { FeedRoutePending } from '@/components/app-shell/route-pending'
import { getNotificationDestination } from '@/features/notifications/navigation'

export const Route = createFileRoute('/_app/notifications')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(notificationsQueryOptions()),
  pendingComponent: FeedRoutePending,
  pendingMs: 250,
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
  const { data } = useSuspenseQuery(notificationsQueryOptions())
  const backfillTargets = useBackfillNotificationTargets()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const [localReadIds, setLocalReadIds] = useState<Set<string>>(new Set())
  const [markingAll, setMarkingAll] = useState(false)

  const notifications =
    mapNotifications(data as Array<NotificationRecord> | undefined) ?? []
  const unreadCount = notifications.filter(
    (notification) =>
      !notification.isRead && !localReadIds.has(String(notification._id)),
  ).length

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
            className="font-mono text-[11.5px] text-text-faint"
          >
            mark all read
          </Button>
        )}
      </div>

      <div className="lx-page-scroll flex-1">
        <div className="lx-page-width-feed">
          {notifications.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 px-8 py-16 text-text-faint">
              <Bell size={32} strokeWidth={1.2} />
              <span className="font-mono text-xs">no notifications yet.</span>
            </div>
          )}

          {notifications.map((notification) => {
            const notificationId = String(notification._id)
            const isRead =
              notification.isRead || localReadIds.has(notificationId)

            return (
              <button
                key={notificationId}
                className={`flex w-full items-start gap-3 border-b border-line px-0 py-4 text-left transition-colors hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  !isRead ? 'bg-[oklch(72%_0.17_185/0.04)]' : 'bg-transparent'
                }`}
                onClick={() => void handleNotificationClick(notification)}
                type="button"
              >
                <div className="relative shrink-0">
                  <LxAvatar
                    name={notification.actorSnapshot.displayName}
                    avatarUrl={notification.actorSnapshot.avatarUrl}
                    size={36}
                  />
                  <div className="absolute -bottom-0.5 -right-0.5 flex size-4.5 items-center justify-center rounded-full border border-line bg-surface">
                    {notifIcon(notification.type)}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="m-0 font-sans text-[13.5px] leading-6 text-text wrap-anywhere">
                    <strong className="font-mono font-semibold">
                      {notification.actorSnapshot.displayName}
                    </strong>{' '}
                    {notifText(notification)}
                  </p>
                  <span className="mt-1 block font-mono text-[11px] text-text-faint">
                    {relativeTime(notification.createdAt)}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
