import { usePaginatedQuery } from 'convex/react'
import type { UsePaginatedQueryReturnType } from 'convex/react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as m from 'motion/react-m'
import { api } from '../../../convex/_generated/api'
import { useMarkConversationRead, useSendMessage } from './mutations'
import type { InboxConversation } from './navigation'
import { MessageComposer } from './message-composer'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Inbox } from '@/lib/icons'
import { fadeUp } from '@/lib/motion'
import { relativeTime } from '@/lib/time'
import { getActionErrorMessage } from '@/lib/action-error'

export type ConversationMessages = Pick<
  UsePaginatedQueryReturnType<typeof api.conversations.messagesPage>,
  'results' | 'status' | 'loadMore'
>
type Props = {
  selectedConversation: InboxConversation
  viewerId: string
  onBack: () => void
  onOpenProfile: (username: string) => void
}

export function SelectedConversationPanel(props: Props) {
  const conversationId = props.selectedConversation._id
  const messagesPage = usePaginatedQuery(
    api.conversations.messagesPage,
    { conversationId },
    { initialNumItems: 30 },
  )
  const sendMessage = useSendMessage()
  const markRead = useMarkConversationRead()
  const onMarkRead = useCallback(() => {
    void markRead({ conversationId })
  }, [conversationId, markRead])
  return (
    <SelectedConversationView
      key={conversationId}
      {...props}
      messagesPage={messagesPage}
      onMarkRead={onMarkRead}
      sendMessage={(content) => sendMessage({ conversationId, content })}
    />
  )
}

export function SelectedConversationView({
  selectedConversation,
  viewerId,
  onBack,
  onOpenProfile,
  messagesPage,
  sendMessage,
  onMarkRead,
}: Props & {
  messagesPage: ConversationMessages
  sendMessage: (content: string) => Promise<unknown>
  onMarkRead: () => void
}) {
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const previousScrollHeightRef = useRef<number | null>(null)
  const openedConversationRef = useRef<string | null>(null)
  const shouldStickToBottomRef = useRef(true)
  const sentMessagePendingRef = useRef(false)
  const lastMessageIdRef = useRef<string | null>(null)

  const messages = useMemo(
    () => [...messagesPage.results].reverse(),
    [messagesPage.results],
  )

  useEffect(() => {
    if ((selectedConversation.unreadCounts[viewerId] ?? 0) > 0) onMarkRead()
  }, [onMarkRead, selectedConversation, viewerId])

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: 'end' })
    })
  }

  const isNearBottom = () => {
    const scrollElement = messagesScrollRef.current
    if (!scrollElement) {
      return true
    }

    return (
      scrollElement.scrollHeight -
        scrollElement.scrollTop -
        scrollElement.clientHeight <
      96
    )
  }

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return

    setSending(true)
    setSendError(null)
    sentMessagePendingRef.current = true
    shouldStickToBottomRef.current = true
    try {
      await sendMessage(newMessage.trim())
      setNewMessage('')
    } catch (error) {
      console.error('Send failed', error)
      setSendError(getActionErrorMessage(error))
      sentMessagePendingRef.current = false
    } finally {
      setSending(false)
    }
  }

  const handleLoadOlder = () => {
    if (messagesPage.status !== 'CanLoadMore') {
      return
    }

    const scrollElement = messagesScrollRef.current
    previousScrollHeightRef.current = scrollElement?.scrollHeight ?? null
    messagesPage.loadMore(30)
  }

  useEffect(() => {
    // Identity keys create fresh state. Resetting refs in this passive effect
    // would undo the layout effect's initial scroll and reopen the thread on
    // the next incoming message, pulling a reader away from older history.
    const frame = requestAnimationFrame(() => textareaRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [selectedConversation._id])

  useLayoutEffect(() => {
    const previousScrollHeight = previousScrollHeightRef.current
    const scrollElement = messagesScrollRef.current
    if (!scrollElement || messages.length === 0) {
      return
    }

    if (previousScrollHeight !== null) {
      const nextScrollHeight = scrollElement.scrollHeight
      scrollElement.scrollTop += nextScrollHeight - previousScrollHeight
      previousScrollHeightRef.current = null
      return
    }

    const lastMessage = messages.at(-1)
    const lastMessageId = lastMessage ? String(lastMessage._id) : null
    const lastMessageChanged = lastMessageId !== lastMessageIdRef.current
    const lastMessageIsMine =
      lastMessage !== undefined && viewerId === String(lastMessage.senderId)

    if (openedConversationRef.current !== String(selectedConversation._id)) {
      scrollElement.scrollTop = scrollElement.scrollHeight
      openedConversationRef.current = String(selectedConversation._id)
      lastMessageIdRef.current = lastMessageId
      return
    }

    if (
      lastMessageChanged &&
      (sentMessagePendingRef.current ||
        shouldStickToBottomRef.current ||
        lastMessageIsMine)
    ) {
      scrollToBottom()
      sentMessagePendingRef.current = false
    }

    lastMessageIdRef.current = lastMessageId
  }, [messages, selectedConversation._id, viewerId])

  const otherUsername = selectedConversation.otherUser?.githubUsername
  const otherDisplayName =
    selectedConversation.otherUser?.displayName ??
    selectedConversation.otherUser?.githubUsername ??
    'Unknown user'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Wraps on phones: the request status takes its own line so the name
          keeps its width and the composer stays above the tab bar. */}
      <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-[var(--lx-gutter)] py-1">
        <Button
          variant="ghost"
          size="touch"
          onClick={onBack}
          className="md:hidden"
        >
          back
        </Button>
        <button
          type="button"
          onClick={() => {
            if (otherUsername) onOpenProfile(otherUsername)
          }}
          disabled={!otherUsername}
          className="flex min-w-0 items-center gap-3 rounded-card px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default"
        >
          <LxAvatar
            name={otherDisplayName}
            avatarUrl={selectedConversation.otherUser?.avatarUrl ?? undefined}
            size={32}
          />
          <div className="min-w-0">
            <div className="truncate font-sans text-label font-medium text-text">
              {otherDisplayName}
            </div>
            <div className="truncate font-mono text-meta text-text-muted">
              {selectedConversation.otherUser?.cityName ?? 'location hidden'}
            </div>
          </div>
        </button>
        {selectedConversation.status !== 'active' && (
          <p className="m-0 basis-full font-mono text-meta text-text-muted md:ml-auto md:basis-auto">
            {selectedConversation.status === 'pending'
              ? 'pending: waiting for a reply'
              : 'message request: reply to accept'}
          </p>
        )}
      </div>

      <div
        ref={messagesScrollRef}
        onScroll={() => {
          shouldStickToBottomRef.current = isNearBottom()
        }}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[var(--lx-gutter)] pt-4 pb-8"
      >
        {messagesPage.status === 'LoadingFirstPage' && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-11 w-2/3 max-w-64 self-start rounded-card" />
            <Skeleton className="h-9 w-1/2 max-w-48 self-end rounded-card" />
            <Skeleton className="h-14 w-3/5 max-w-72 self-start rounded-card" />
          </div>
        )}
        {messagesPage.status === 'CanLoadMore' && (
          <Button size="meta" onClick={handleLoadOlder} className="self-center">
            load older messages
          </Button>
        )}
        {messagesPage.status === 'LoadingMore' && (
          <div className="mx-auto mb-2 font-mono text-meta text-text-muted">
            loading older messages…
          </div>
        )}
        {messagesPage.status !== 'LoadingFirstPage' &&
          messages.length === 0 && (
            <EmptyState
              icon={<Inbox size={28} strokeWidth={1.2} />}
              title="no messages yet"
              description="send the first message below to start the conversation."
            />
          )}
        {messages.map((message) => {
          const isMe = viewerId === String(message.senderId)
          return (
            <m.div
              key={String(message._id)}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[min(100%,36rem)] rounded-card px-3.5 py-2.5 ${
                  isMe
                    ? 'border border-brand/30 bg-outgoing text-text'
                    : 'border border-line bg-surface text-text'
                }`}
              >
                <div className="whitespace-pre-wrap font-sans text-body leading-6">
                  {message.content}
                </div>
                <div className="mt-1.5 font-mono text-meta text-text-muted">
                  {relativeTime(message.createdAt)}
                </div>
              </div>
            </m.div>
          )
        })}
        <div ref={messagesEndRef} aria-hidden="true" />
      </div>

      <MessageComposer
        value={newMessage}
        sending={sending}
        error={sendError}
        textareaRef={textareaRef}
        onChange={setNewMessage}
        onSend={handleSend}
      />
    </div>
  )
}
