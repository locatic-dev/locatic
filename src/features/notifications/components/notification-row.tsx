import { LxAvatar } from '@/components/ui/lx-avatar'
import type { NotificationRecord } from '@/features/contracts'
import { Bell, Heart, MessageSquare, Send, Star, UserPlus } from '@/lib/icons'
import { relativeTime } from '@/lib/time'
import { getNotificationAction, type NotificationType } from '../copy'

function NotificationIcon({ type }: { type: NotificationType }) {
  switch (type) {
    case 'project_liked':
      return <Heart size={14} className="text-brand" fill="currentColor" />
    case 'post_reacted':
      return <Heart size={14} className="text-text-muted" />
    case 'project_commented':
    case 'post_commented':
    case 'comment_replied':
      return <MessageSquare size={14} className="text-text-muted" />
    case 'followed':
      return <UserPlus size={14} className="text-text-muted" />
    case 'dm_received':
      return <Send size={14} className="text-text-muted" />
    case 'contributor_recognized':
      return <Star size={14} className="text-text-muted" />
    default:
      return <Bell size={14} className="text-text-muted" />
  }
}

/**
 * One notification. The whole row is one button whose accessible name starts
 * with "unread" while the notification is unread, so the state is announced,
 * not only drawn as a dot.
 */
export function NotificationRow({
  isRead,
  notification,
  onOpen,
  onPrefetch,
}: {
  isRead: boolean
  notification: NotificationRecord
  onOpen: () => void
  onPrefetch: () => void
}) {
  return (
    <button
      className="flex w-full items-start gap-3 px-3 py-3 text-left transition-colors active:scale-[0.99] hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
      onClick={onOpen}
      onFocus={onPrefetch}
      onPointerEnter={onPrefetch}
      onTouchStart={onPrefetch}
      type="button"
    >
      <div aria-hidden className="relative shrink-0">
        <LxAvatar
          name={notification.actorSnapshot.displayName}
          avatarUrl={notification.actorSnapshot.avatarUrl}
          size={36}
        />
        <div className="absolute -right-0.5 -bottom-0.5 flex size-4.5 items-center justify-center rounded-full border border-line bg-surface">
          <NotificationIcon type={notification.type} />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`m-0 font-sans text-body leading-6 wrap-anywhere ${
            isRead ? 'text-text-muted' : 'text-text'
          }`}
        >
          {!isRead && (
            <>
              <span className="sr-only">unread:</span>{' '}
            </>
          )}
          <strong className="font-mono font-semibold text-text">
            {notification.actorSnapshot.displayName}
          </strong>{' '}
          {getNotificationAction(notification)}
        </p>
        <span className="mt-1 block font-mono text-meta text-text-faint">
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
}
