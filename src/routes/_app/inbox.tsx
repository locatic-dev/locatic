import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { usePaginatedQuery } from 'convex/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import {
  conversationRecipientPreviewQueryOptions,
  conversationsQueryOptions,
} from '@/features/inbox/queries'
import {
  useMarkConversationRead,
  useSendFirstMessage,
  useSendMessage,
} from '@/features/inbox/mutations'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { relativeTime } from '@/lib/time'
import { Inbox, Send } from '@/lib/icons'
import {
  mapConversationList,
  mapViewerBootstrap,
  type ConversationDetailPayload,
  type EnrichedConversation,
  type ViewerBootstrapPayload,
} from '@/features/contracts'
import { viewerQueryOptions } from '@/features/viewer/queries'
import {
  InboxRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '@/components/app-shell/route-pending'
import { getInboxDestinationSearch } from '@/features/inbox/navigation'

export const Route = createFileRoute('/_app/inbox')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: ((search.tab as string) === 'requests' ? 'requests' : 'inbox') as
      | 'inbox'
      | 'requests',
    conversation:
      typeof search.conversation === 'string' ? search.conversation : null,
    compose:
      typeof search.compose === 'string' &&
      typeof search.conversation !== 'string'
        ? search.compose
        : null,
  }),
  loaderDeps: ({ search }) => ({
    composeUserId: search.compose,
    conversationId: search.conversation,
  }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(conversationsQueryOptions()),
      context.queryClient.ensureQueryData(viewerQueryOptions()),
    ])

    void deps.conversationId
    void deps.composeUserId
  },
  pendingComponent: InboxRoutePending,
  pendingMs: ROUTE_PENDING_MS,
  pendingMinMs: ROUTE_PENDING_MIN_MS,
  component: InboxPage,
})

function InboxPage() {
  const {
    tab,
    conversation: selectedId,
    compose: composeUserId,
  } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: viewerData } = useSuspenseQuery(viewerQueryOptions())
  const { data: conversationsData } = useSuspenseQuery(
    conversationsQueryOptions(),
  )

  const viewer = mapViewerBootstrap(
    viewerData as ViewerBootstrapPayload | undefined,
  )
  const viewerId = viewer?.viewer?.id ? String(viewer.viewer.id) : null
  const allConversations =
    mapConversationList(conversationsData as Array<EnrichedConversation>) ?? []
  const conversations = allConversations.filter((conversation) =>
    tab === 'requests' ? conversation.isRequest : !conversation.isRequest,
  )
  const selectedConversation =
    allConversations.find(
      (conversation) => String(conversation._id) === selectedId,
    ) ?? null
  const recipientPreviewQuery = useQuery({
    ...conversationRecipientPreviewQueryOptions(composeUserId ?? ''),
    enabled: Boolean(composeUserId) && !selectedConversation,
  })
  const draftRecipient = recipientPreviewQuery.data ?? null
  const composePreviewLoading =
    Boolean(composeUserId) &&
    !selectedConversation &&
    recipientPreviewQuery.isLoading
  const composePreviewInvalid =
    Boolean(composeUserId) &&
    !selectedConversation &&
    !recipientPreviewQuery.isLoading &&
    !draftRecipient
  const hasDetailPanel = Boolean(
    selectedConversation ||
    draftRecipient ||
    composePreviewLoading ||
    composePreviewInvalid,
  )
  const markConversationRead = useMarkConversationRead()

  useEffect(() => {
    if (!selectedConversation || !viewerId) return

    const unreadCount = selectedConversation.unreadCounts[viewerId] ?? 0
    if (unreadCount <= 0) return

    void markConversationRead({
      conversationId: selectedConversation._id,
    })
  }, [markConversationRead, selectedConversation, viewerId])

  const tabItems = [
    {
      id: 'inbox',
      label: 'inbox',
      count: allConversations.filter((conversation) => !conversation.isRequest)
        .length,
    },
    {
      id: 'requests',
      label: 'requests',
      count: allConversations.filter((conversation) => conversation.isRequest)
        .length,
    },
  ] as const

  const openProfile = (username: string | null | undefined) => {
    if (!username) {
      return
    }

    void navigate({
      to: '/u/$username',
      params: { username },
      search: { tab: 'projects', network: 'followers' },
    })
  }

  return (
    <div className="lx-page-shell h-[calc(100dvh-var(--lx-mobile-tab-height))] min-h-0 overflow-hidden md:h-dvh">
      <div className="shrink-0 border-b border-line">
        <div className="flex min-h-14 items-center px-[var(--lx-gutter)]">
          <h1 className="m-0 font-mono text-sm font-semibold text-text">
            inbox
          </h1>
        </div>
        <div className="lx-inline-tabs gap-0 px-[var(--lx-gutter)]">
          {tabItems.map((tabItem) => (
            <button
              key={tabItem.id}
              onClick={() =>
                void navigate({
                  to: '/inbox',
                  search: {
                    compose: null,
                    conversation: null,
                    tab: tabItem.id,
                  },
                })
              }
              className={`relative inline-flex items-center gap-[7px] px-4 py-2.5 font-mono text-[12px] transition-colors ${
                tab === tabItem.id
                  ? 'font-semibold text-text'
                  : 'text-text-faint'
              }`}
              type="button"
            >
              {tabItem.label}
              {tabItem.count > 0 && (
                <span className="rounded-pill bg-surface-alt px-[5px] py-px font-mono text-[10px] leading-[1.3] text-text-faint">
                  {tabItem.count}
                </span>
              )}
              {tab === tabItem.id && (
                <div className="absolute right-2 -bottom-px left-2 h-0.5 bg-brand" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          className={
            hasDetailPanel
              ? 'hidden'
              : 'flex min-h-0 w-full shrink-0 flex-col border-b border-line'
          }
        >
          <div
            className={
              conversations.length > 0 ? 'flex-1 overflow-y-auto' : undefined
            }
          >
            {conversations.length === 0 && (
              <div className="px-5 py-8 text-center font-mono text-xs text-text-faint">
                {tab === 'requests'
                  ? 'no message requests.'
                  : 'no conversations yet.'}
              </div>
            )}

            {conversations.map((conversation) => {
              const unreadCount =
                viewerId && conversation.unreadCounts[viewerId]
                  ? conversation.unreadCounts[viewerId]
                  : 0
              const isSelected = selectedId === String(conversation._id)

              return (
                <div
                  key={String(conversation._id)}
                  className={`flex items-stretch gap-3 border-b border-line px-5 py-3.5 transition-colors ${
                    isSelected
                      ? 'bg-surface-alt'
                      : 'bg-transparent hover:bg-surface-alt'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      openProfile(conversation.otherUser?.githubUsername)
                    }
                    className="flex min-h-11 shrink-0 items-center rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    aria-label={`Open ${conversation.otherUser?.displayName ?? conversation.otherUser?.githubUsername ?? 'user'} profile`}
                  >
                    <LxAvatar
                      name={
                        conversation.otherUser?.displayName ??
                        conversation.otherUser?.githubUsername ??
                        'user'
                      }
                      avatarUrl={conversation.otherUser?.avatarUrl ?? undefined}
                      size={36}
                    />
                  </button>
                  <button
                    onClick={() =>
                      void navigate({
                        to: '/inbox',
                        search: {
                          compose: null,
                          tab,
                          conversation: String(conversation._id),
                        },
                      })
                    }
                    aria-label={`Open conversation with ${
                      conversation.otherUser?.displayName ??
                      conversation.otherUser?.githubUsername ??
                      'user'
                    }`}
                    className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    type="button"
                  >
                    <div className="mb-1 flex flex-wrap justify-between gap-2">
                      <span className="font-mono text-[12.5px] font-semibold text-text [overflow-wrap:anywhere]">
                        {conversation.otherUser?.displayName ??
                          conversation.otherUser?.githubUsername ??
                          'Unknown user'}
                      </span>
                      <span className="ml-2 shrink-0 font-mono text-[10.5px] text-text-faint">
                        {relativeTime(conversation.lastMessage.sentAt)}
                      </span>
                    </div>
                    <div className="font-sans text-xs text-text-muted [overflow-wrap:anywhere]">
                      {conversation.lastMessage.content}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="font-mono text-[10.5px] text-text-faint">
                        {conversation.otherUser?.cityName ?? 'location hidden'}
                      </span>
                      {unreadCount > 0 && (
                        <span className="rounded-pill bg-unread px-1.5 py-px font-mono text-[10px] leading-[1.4] text-brand-foreground">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {!hasDetailPanel && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3.5 text-text-faint">
              <Inbox size={36} strokeWidth={1.2} />
              <span className="font-mono text-xs">
                select a conversation to read messages.
              </span>
            </div>
          )}

          {composePreviewLoading && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3.5 text-text-faint">
              <Inbox size={36} strokeWidth={1.2} />
              <span className="font-mono text-xs">loading conversation…</span>
            </div>
          )}

          {composePreviewInvalid && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3.5 px-[var(--lx-gutter)] text-center text-text-faint">
              <Inbox size={36} strokeWidth={1.2} />
              <span className="font-mono text-xs">
                could not open this message draft.
              </span>
              <Button
                variant="monoOutline"
                size="meta"
                onClick={() =>
                  void navigate({
                    to: '/inbox',
                    search: { compose: null, tab, conversation: null },
                  })
                }
              >
                back to inbox
              </Button>
            </div>
          )}

          {selectedConversation && viewerId && (
            <SelectedConversationPanel
              tab={tab}
              selectedConversation={selectedConversation}
              viewerId={viewerId}
            />
          )}

          {!selectedConversation && composeUserId && draftRecipient && (
            <DraftConversationPanel
              tab={tab}
              otherUserId={draftRecipient.userId}
              recipient={draftRecipient}
            />
          )}
        </div>
      </div>
    </div>
  )
}

type DraftRecipient = {
  userId: Id<'users'>
  githubUsername: string
  displayName: string
  avatarUrl: string | null
  cityName: string | null
}

function DraftConversationPanel({
  otherUserId,
  recipient,
  tab,
}: {
  otherUserId: Id<'users'>
  recipient: DraftRecipient
  tab: 'inbox' | 'requests'
}) {
  const navigate = Route.useNavigate()
  const sendFirstMessage = useSendFirstMessage()
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [otherUserId])

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return

    setSending(true)
    try {
      const result = await sendFirstMessage({
        otherUserId,
        content: newMessage.trim(),
      })
      setNewMessage('')
      await navigate({
        to: '/inbox',
        search: getInboxDestinationSearch(
          String(result.conversationId),
          result.isRequest,
        ),
      })
    } catch (error) {
      console.error('Send failed', error)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-line px-[var(--lx-gutter)]">
        <Button
          variant="ghost"
          onClick={() =>
            void navigate({
              to: '/inbox',
              search: { compose: null, tab, conversation: null },
            })
          }
          className="md:hidden"
        >
          back
        </Button>
        <button
          type="button"
          onClick={() =>
            void navigate({
              to: '/u/$username',
              params: { username: recipient.githubUsername },
              search: { tab: 'projects', network: 'followers' },
            })
          }
          className="flex min-w-0 items-center gap-3 rounded-[6px] px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <LxAvatar
            name={recipient.displayName}
            avatarUrl={recipient.avatarUrl ?? undefined}
            size={32}
          />
          <div className="min-w-0">
            <div className="font-mono text-[12.5px] font-semibold text-text">
              {recipient.displayName}
            </div>
            <div className="font-mono text-[10.5px] text-text-faint">
              {recipient.cityName ?? 'location hidden'}
            </div>
          </div>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-[var(--lx-gutter)] text-center font-mono text-xs text-text-faint">
        write the first message.
      </div>

      <div className="shrink-0 border-t border-line px-[var(--lx-gutter)] pt-2 pb-[calc(var(--lx-mobile-tab-height)+0.75rem)] md:pt-4 md:pb-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-1.5 rounded-card border border-line bg-surface p-1.5 md:gap-3 md:border-0 md:bg-transparent md:p-0">
          <Textarea
            ref={textareaRef}
            value={newMessage}
            onChange={(event) => setNewMessage(event.target.value)}
            placeholder="write a message…"
            rows={1}
            className="max-h-28 min-h-11 min-w-0 resize-none border-0 bg-transparent px-3 py-2.5 font-sans text-[16px] leading-6 text-text shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 md:min-h-20 md:border md:border-line md:bg-surface md:px-3 md:py-2 md:text-sm md:focus-visible:ring-2 md:focus-visible:ring-ring md:focus-visible:ring-offset-2"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void handleSend()
              }
            }}
          />
          <Button
            type="button"
            onClick={() => void handleSend()}
            disabled={!newMessage.trim() || sending}
            className="h-11 min-h-11 w-11 min-w-11 shrink-0 self-end border-none bg-brand px-0 font-mono text-[12.5px] font-semibold text-brand-foreground hover:bg-brand/90 md:w-auto md:px-4"
            aria-label={sending ? 'Sending message' : 'Send message'}
          >
            <Send size={16} aria-hidden="true" className="md:hidden" />
            <span className="hidden md:inline">
              {sending ? 'sending…' : 'send'}
            </span>
          </Button>
        </div>
      </div>
    </div>
  )
}

function SelectedConversationPanel({
  tab,
  selectedConversation,
  viewerId,
}: {
  tab: 'inbox' | 'requests'
  selectedConversation: EnrichedConversation
  viewerId: string
}) {
  const navigate = Route.useNavigate()
  const sendMessage = useSendMessage()
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const previousScrollHeightRef = useRef<number | null>(null)
  const openedConversationRef = useRef<string | null>(null)
  const shouldStickToBottomRef = useRef(true)
  const sentMessagePendingRef = useRef(false)
  const lastMessageIdRef = useRef<string | null>(null)
  const messagesPage = usePaginatedQuery(
    api.conversations.messagesPage,
    { conversationId: selectedConversation._id },
    { initialNumItems: 30 },
  )

  const messages = useMemo(
    () =>
      [
        ...((messagesPage.results ??
          []) as ConversationDetailPayload['messages']),
      ].reverse(),
    [messagesPage.results],
  )

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
    sentMessagePendingRef.current = true
    shouldStickToBottomRef.current = true
    try {
      await sendMessage({
        conversationId: selectedConversation._id,
        content: newMessage.trim(),
      })
      setNewMessage('')
    } catch (error) {
      console.error('Send failed', error)
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
    openedConversationRef.current = null
    previousScrollHeightRef.current = null
    shouldStickToBottomRef.current = true
    sentMessagePendingRef.current = false
    lastMessageIdRef.current = null
    requestAnimationFrame(() => textareaRef.current?.focus())
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
      <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-line px-[var(--lx-gutter)]">
        <Button
          variant="ghost"
          onClick={() =>
            void navigate({
              to: '/inbox',
              search: { compose: null, tab, conversation: null },
            })
          }
          className="md:hidden"
        >
          back
        </Button>
        <button
          type="button"
          onClick={() => {
            if (!otherUsername) {
              return
            }

            void navigate({
              to: '/u/$username',
              params: { username: otherUsername },
              search: { tab: 'projects', network: 'followers' },
            })
          }}
          disabled={!otherUsername}
          className="flex min-w-0 items-center gap-3 rounded-[6px] px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default"
        >
          <LxAvatar
            name={otherDisplayName}
            avatarUrl={selectedConversation.otherUser?.avatarUrl ?? undefined}
            size={32}
          />
          <div className="min-w-0">
            <div className="font-mono text-[12.5px] font-semibold text-text">
              {otherDisplayName}
            </div>
            <div className="font-mono text-[10.5px] text-text-faint">
              {selectedConversation.otherUser?.cityName ?? 'location hidden'}
            </div>
          </div>
        </button>
      </div>

      <div
        ref={messagesScrollRef}
        onScroll={() => {
          shouldStickToBottomRef.current = isNearBottom()
        }}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[var(--lx-gutter)] pt-4 pb-8"
      >
        {messagesPage.status === 'CanLoadMore' && (
          <Button
            variant="monoOutline"
            size="meta"
            onClick={handleLoadOlder}
            className="mx-auto mb-2 font-mono"
          >
            load older messages
          </Button>
        )}
        {messagesPage.status === 'LoadingMore' && (
          <div className="mx-auto mb-2 font-mono text-[11px] text-text-faint">
            loading older messages…
          </div>
        )}
        {messages.map((message) => {
          const isMe = viewerId === String(message.senderId)
          return (
            <div
              key={String(message._id)}
              className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[min(100%,36rem)] rounded-lg px-3 py-2.5 ${
                  isMe
                    ? 'border border-brand/30 bg-outgoing text-text'
                    : 'border border-line bg-surface text-text'
                }`}
              >
                <div className="whitespace-pre-wrap font-sans text-[13.5px] leading-6">
                  {message.content}
                </div>
                <div className="mt-1.5 font-mono text-[10.5px] text-text-faint">
                  {relativeTime(message.createdAt)}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} aria-hidden="true" />
      </div>

      <div className="shrink-0 border-t border-line px-[var(--lx-gutter)] pt-2 pb-[calc(var(--lx-mobile-tab-height)+0.75rem)] md:pt-4 md:pb-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-1.5 rounded-card border border-line bg-surface p-1.5 md:gap-3 md:border-0 md:bg-transparent md:p-0">
          <Textarea
            ref={textareaRef}
            value={newMessage}
            onChange={(event) => setNewMessage(event.target.value)}
            placeholder="write a message…"
            rows={1}
            className="max-h-28 min-h-11 min-w-0 resize-none border-0 bg-transparent px-3 py-2.5 font-sans text-[16px] leading-6 text-text shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 md:min-h-20 md:border md:border-line md:bg-surface md:px-3 md:py-2 md:text-sm md:focus-visible:ring-2 md:focus-visible:ring-ring md:focus-visible:ring-offset-2"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void handleSend()
              }
            }}
          />
          <Button
            type="button"
            onClick={() => void handleSend()}
            disabled={!newMessage.trim() || sending}
            className="h-11 min-h-11 w-11 min-w-11 shrink-0 self-end border-none bg-brand px-0 font-mono text-[12.5px] font-semibold text-brand-foreground hover:bg-brand/90 md:w-auto md:px-4"
            aria-label={sending ? 'Sending message' : 'Send message'}
          >
            <Send size={16} aria-hidden="true" className="md:hidden" />
            <span className="hidden md:inline">
              {sending ? 'sending…' : 'send'}
            </span>
          </Button>
        </div>
      </div>
    </div>
  )
}
