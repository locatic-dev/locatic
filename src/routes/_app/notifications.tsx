import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { notificationsQueryOptions } from '@/features/notifications/queries'
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from '@/features/notifications/mutations'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { Button } from '@/components/ui/button'
import { relativeTime } from '@/lib/time'
import { Bell, Heart, MessageSquare, UserPlus } from '@/lib/icons'
import { mapNotifications } from '@/features/contracts'
import type { Doc } from '../../../convex/_generated/dataModel'

export const Route = createFileRoute('/_app/notifications')({
  component: NotificationsPage,
})

function notifIcon(type: string) {
  if (type === 'project_liked') {
    return (
      <Heart
        size={14}
        style={{ color: 'var(--lx-accent)' }}
        fill="currentColor"
      />
    )
  }
  if (type === 'project_commented' || type === 'comment_replied') {
    return <MessageSquare size={14} style={{ color: 'var(--lx-text-2)' }} />
  }
  if (type === 'followed') {
    return <UserPlus size={14} style={{ color: 'var(--lx-text-2)' }} />
  }
  return <Bell size={14} style={{ color: 'var(--lx-text-2)' }} />
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
  const notifQuery = useQuery(notificationsQueryOptions())
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const [localReadIds, setLocalReadIds] = useState<Set<string>>(new Set())
  const [markingAll, setMarkingAll] = useState(false)
  const [pendingReadIds, setPendingReadIds] = useState<Set<string>>(new Set())

  const notifications = mapNotifications(
    notifQuery.data as Array<Doc<'notifications'>> | undefined,
  )
  const unreadCount = notifications.filter(
    (notification) =>
      !notification.isRead && !localReadIds.has(String(notification._id)),
  ).length

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

  const handleMarkRead = async (notificationId: string) => {
    if (
      pendingReadIds.has(notificationId) ||
      localReadIds.has(notificationId)
    ) {
      return
    }

    setPendingReadIds((current) => new Set(current).add(notificationId))
    setLocalReadIds((current) => new Set(current).add(notificationId))

    try {
      await markRead({ notificationId: notificationId as never })
    } catch (error) {
      console.error('Mark read failed', error)
      setLocalReadIds((current) => {
        const next = new Set(current)
        next.delete(notificationId)
        return next
      })
    } finally {
      setPendingReadIds((current) => {
        const next = new Set(current)
        next.delete(notificationId)
        return next
      })
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: 56,
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--lx-border)',
          flexShrink: 0,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--lx-font-mono)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--lx-text)',
          }}
        >
          notifications
        </h1>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            onClick={() => void handleMarkAll()}
            disabled={markingAll}
            style={{
              fontFamily: 'var(--lx-font-mono)',
              fontSize: 11.5,
              color: 'var(--lx-text-3)',
            }}
          >
            mark all read
          </Button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {notifications.length === 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '64px 32px',
              gap: 12,
              color: 'var(--lx-text-3)',
            }}
          >
            <Bell size={32} strokeWidth={1.2} />
            <span style={{ fontFamily: 'var(--lx-font-mono)', fontSize: 12 }}>
              no notifications yet.
            </span>
          </div>
        )}

        {notifications.map((notification) => {
          const notificationId = String(notification._id)
          const isRead = notification.isRead || localReadIds.has(notificationId)

          return (
            <button
              key={notificationId}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                padding: '16px 32px',
                border: 'none',
                borderBottom: '1px solid var(--lx-border)',
                background: !isRead
                  ? 'oklch(72% 0.17 185 / 0.04)'
                  : 'transparent',
                cursor: 'pointer',
                transition: 'background 0.14s',
                textAlign: 'left',
              }}
              onClick={() => void handleMarkRead(notificationId)}
              type="button"
            >
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <LxAvatar
                  name={notification.actorSnapshot.displayName}
                  avatarUrl={notification.actorSnapshot.avatarUrl}
                  size={36}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: -2,
                    right: -2,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: 'var(--lx-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid var(--lx-border)',
                  }}
                >
                  {notifIcon(notification.type)}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    fontFamily: 'var(--lx-font-sans)',
                    fontSize: 13.5,
                    color: 'var(--lx-text)',
                    lineHeight: 1.5,
                  }}
                >
                  <strong
                    style={{
                      fontFamily: 'var(--lx-font-mono)',
                      fontWeight: 600,
                    }}
                  >
                    {notification.actorSnapshot.displayName}
                  </strong>{' '}
                  {notifText(notification)}
                </p>
                <span
                  style={{
                    fontFamily: 'var(--lx-font-mono)',
                    fontSize: 11,
                    color: 'var(--lx-text-3)',
                    marginTop: 4,
                    display: 'block',
                  }}
                >
                  {relativeTime(notification.createdAt)}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
