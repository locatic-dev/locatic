import * as m from 'motion/react-m'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { fadeUp, listStagger } from '@/lib/motion'
import { relativeTime } from '@/lib/time'
import type { InboxConversation, InboxTab } from './navigation'

type Props = {
  conversations: ReadonlyArray<InboxConversation>
  activeTab: InboxTab
  viewerId: string | null
  selectedId: string | null
  onOpenProfile: (username: string | null | undefined) => void
  onSelectConversation: (id: string) => void
}

function conversationPartnerName(conversation: InboxConversation) {
  return (
    conversation.otherUser?.displayName ??
    conversation.otherUser?.githubUsername ??
    'user'
  )
}

export function ConversationList({
  conversations,
  activeTab,
  viewerId,
  selectedId,
  onOpenProfile,
  onSelectConversation,
}: Props) {
  return (
    <m.div
      key={activeTab}
      variants={listStagger}
      initial="hidden"
      animate="visible"
    >
      {conversations.map((conversation) => {
        const unreadCount =
          viewerId && conversation.unreadCounts[viewerId]
            ? conversation.unreadCounts[viewerId]
            : 0
        const isUnread = unreadCount > 0
        const isPending = conversation.status === 'pending'
        const isSelected = selectedId === String(conversation._id)
        const partnerName = conversationPartnerName(conversation)
        const openLabel = [
          `Open conversation with ${partnerName}`,
          isPending ? 'pending' : null,
          isUnread ? `${unreadCount} unread` : null,
        ]
          .filter(Boolean)
          .join(', ')

        return (
          <m.div
            key={String(conversation._id)}
            variants={fadeUp}
            className={`relative flex items-stretch gap-3 border-b border-line px-4 py-3 transition-colors active:scale-[0.99] ${
              isSelected
                ? 'bg-selected'
                : 'bg-transparent hover:bg-surface-raised'
            }`}
          >
            {isSelected && (
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-0.5 bg-brand"
              />
            )}
            <button
              type="button"
              onClick={() =>
                onOpenProfile(conversation.otherUser?.githubUsername)
              }
              className="flex min-h-11 shrink-0 items-center rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              aria-label={`Open ${partnerName} profile`}
            >
              <LxAvatar
                name={partnerName}
                avatarUrl={conversation.otherUser?.avatarUrl ?? undefined}
                size={36}
              />
            </button>
            <button
              onClick={() => onSelectConversation(String(conversation._id))}
              aria-label={openLabel}
              aria-current={isSelected ? 'true' : undefined}
              className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              type="button"
            >
              <div className="mb-1 flex flex-wrap justify-between gap-2">
                <span
                  className={`font-mono text-label [overflow-wrap:anywhere] ${
                    isUnread
                      ? 'font-semibold text-text'
                      : 'font-medium text-text-muted'
                  }`}
                >
                  {conversation.otherUser?.displayName ??
                    conversation.otherUser?.githubUsername ??
                    'Unknown user'}
                </span>
                <span className="ml-2 flex shrink-0 items-center gap-2 font-mono text-meta text-text-muted">
                  {isPending && (
                    <span className="rounded-pill border border-line px-1.5 py-px text-text-muted">
                      pending
                    </span>
                  )}
                  {relativeTime(conversation.lastMessage.sentAt)}
                </span>
              </div>
              <div
                className={`font-sans text-xs [overflow-wrap:anywhere] ${
                  isUnread ? 'font-medium text-text' : 'text-text-muted'
                }`}
              >
                {conversation.lastMessage.content}
              </div>
              {(conversation.otherUser?.cityName || isUnread) && (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  {conversation.otherUser?.cityName ? (
                    <span className="font-mono text-meta text-text-muted">
                      {conversation.otherUser.cityName}
                    </span>
                  ) : (
                    <span />
                  )}
                  {isUnread && (
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="size-1.5 rounded-full bg-unread"
                      />
                      <span className="rounded-pill bg-unread px-1.5 py-px font-mono text-meta leading-[1.4] text-brand-foreground">
                        {unreadCount}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </button>
          </m.div>
        )
      })}
    </m.div>
  )
}
