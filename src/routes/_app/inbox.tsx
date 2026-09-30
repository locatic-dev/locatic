import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { usePaginatedQuery } from 'convex/react'
import * as m from 'motion/react-m'
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
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { fadeUp, listStagger } from '@/lib/motion'
import { getActionErrorMessage } from '@/lib/action-error'
import { relativeTime } from '@/lib/time'
import { Inbox, Send } from '@/lib/icons'
import { formatUnreadCount } from '@/lib/format'
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
import {
  getInboxDestinationSearch,
  getInboxTabForStatus,
  type InboxConversation,
  type InboxTab,
} from '@/features/inbox/navigation'
import { shouldPrefetchPrivateConvexQueries } from '@/lib/auth-routing'

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
    void deps.conversationId
    void deps.composeUserId

    // Client navigations fetch in the page, once Convex auth is ready.
    if (!shouldPrefetchPrivateConvexQueries()) {
      return
    }

    await Promise.all([
      context.queryClient.ensureQueryData(conversationsQueryOptions()),
      context.queryClient.ensureQueryData(viewerQueryOptions()),
    ])
  },
  pendingComponent: InboxRoutePending,
  pendingMs: ROUTE_PENDING_MS,
  pendingMinMs: ROUTE_PENDING_MIN_MS,
  component: InboxPage,
})

function conversationPartnerName(conversation: InboxConversation) {
  return (
    conversation.otherUser?.displayName ??
    conversation.otherUser?.githubUsername ??
    'user'
  )
}

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
  // The one message-attention count: the server counter the sidebar and the
  // mobile tab bar badge also read (`users.viewerBootstrap`).
  const unreadMessages = viewer?.viewer?.unreadMessagesCount ?? 0
  const allConversations =
    mapConversationList(conversationsData as Array<EnrichedConversation>) ?? []
  const selectedConversation =
    allConversations.find(
      (conversation) => String(conversation._id) === selectedId,
    ) ?? null
  // A stored link (a notification, a bookmark) can name a tab the
  // conversation has since left, e.g. a request accepted after it was sent.
  // The selected conversation's own status decides which list shows it.
  const activeTab = selectedConversation
    ? getInboxTabForStatus(selectedConversation.status)
    : tab
  const conversations = allConversations.filter(
    (conversation) => getInboxTabForStatus(conversation.status) === activeTab,
  )
  const incomingRequestCount = allConversations.filter(
    (conversation) => conversation.status === 'request',
  ).length
  const recipientPreviewQuery = useQuery(
    conversationRecipientPreviewQueryOptions(
      composeUserId && !selectedConversation ? composeUserId : null,
    ),
  )
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
  // Phones show one pane at a time and the URL decides which: a selected
  // conversation or draft shows the thread, otherwise the list. Desktop
  // always shows both side by side.
  const mobileView = hasDetailPanel ? 'thread' : 'list'
  // With nothing to list and nothing open, the list's empty state is the only
  // message; no second "select a conversation" placeholder beside it.
  const listOnly = conversations.length === 0 && !hasDetailPanel
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
    { id: 'inbox', label: 'inbox', count: 0 },
    { id: 'requests', label: 'requests', count: incomingRequestCount },
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
        <div className="flex min-h-14 items-center gap-3 px-[var(--lx-gutter)]">
          <h1 className="m-0 text-headline text-text">inbox</h1>
          {unreadMessages > 0 && (
            <span className="font-mono text-meta text-text-muted">
              {formatUnreadCount(unreadMessages)} unread
            </span>
          )}
        </div>
        {/* Pulled left by the tab padding: the first label lines up with the
            title. */}
        <div className="lx-inline-tabs -ml-3 gap-0 px-[var(--lx-gutter)]">
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
              aria-current={activeTab === tabItem.id ? 'page' : undefined}
              className={`relative inline-flex items-center gap-[7px] rounded-md px-3 py-2.5 font-mono text-label transition-colors active:scale-[0.98] ${
                activeTab === tabItem.id
                  ? 'font-semibold text-text'
                  : 'text-text-muted hover:text-text'
              }`}
              type="button"
            >
              {tabItem.label}
              {tabItem.count > 0 && (
                <span className="rounded-pill bg-surface-alt px-[5px] py-px font-mono text-meta leading-[1.3] text-text-muted">
                  {tabItem.count}
                </span>
              )}
              {activeTab === tabItem.id && (
                <div className="absolute inset-x-3 -bottom-px h-0.5 bg-brand" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div data-mobile-view={mobileView} className="flex min-h-0 flex-1">
        <section
          aria-label="conversations"
          className={`min-h-0 w-full flex-col md:flex ${
            listOnly
              ? 'md:flex-1'
              : 'md:w-88 md:shrink-0 md:border-r md:border-line'
          } ${mobileView === 'thread' ? 'hidden' : 'flex'}`}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            {conversations.length === 0 && (
              <EmptyState
                size="compact"
                icon={<Inbox size={28} strokeWidth={1.2} />}
                title={
                  activeTab === 'requests'
                    ? 'no message requests'
                    : 'no conversations yet'
                }
                description={
                  activeTab === 'requests'
                    ? 'requests from builders you don’t follow back will land here.'
                    : 'start a conversation from a builder’s profile to see it here.'
                }
              />
            )}

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
                        openProfile(conversation.otherUser?.githubUsername)
                      }
                      className="flex min-h-11 shrink-0 items-center rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      aria-label={`Open ${partnerName} profile`}
                    >
                      <LxAvatar
                        name={partnerName}
                        avatarUrl={
                          conversation.otherUser?.avatarUrl ?? undefined
                        }
                        size={36}
                      />
                    </button>
                    <button
                      onClick={() =>
                        void navigate({
                          to: '/inbox',
                          search: {
                            compose: null,
                            tab: activeTab,
                            conversation: String(conversation._id),
                          },
                        })
                      }
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
          </div>
        </section>

        <section
          aria-label="conversation"
          className={`min-h-0 flex-1 flex-col ${
            listOnly ? 'hidden' : 'md:flex'
          } ${mobileView === 'list' ? 'hidden' : 'flex'}`}
        >
          {!hasDetailPanel && !listOnly && (
            <EmptyState
              icon={<Inbox size={32} strokeWidth={1.2} />}
              title="select a conversation"
              description="pick a thread from the list to read and reply."
            />
          )}

          {composePreviewLoading && (
            <div
              role="status"
              aria-label="loading recipient"
              className="flex flex-1 flex-col items-center justify-center gap-3.5 px-[var(--lx-gutter)]"
            >
              <Skeleton className="size-9 rounded-full" />
              <div className="flex flex-col items-center gap-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          )}

          {composePreviewInvalid && (
            <EmptyState
              icon={<Inbox size={32} strokeWidth={1.2} />}
              title="couldn't open this draft"
              description="the message draft is no longer available."
              action={{
                label: 'back to inbox',
                onClick: () =>
                  void navigate({
                    to: '/inbox',
                    search: {
                      compose: null,
                      tab: activeTab,
                      conversation: null,
                    },
                  }),
              }}
            />
          )}

          {selectedConversation && viewerId && (
            <SelectedConversationPanel
              tab={activeTab}
              selectedConversation={selectedConversation}
              viewerId={viewerId}
            />
          )}

          {!selectedConversation && composeUserId && draftRecipient && (
            <DraftConversationPanel
              tab={activeTab}
              otherUserId={draftRecipient.userId}
              recipient={draftRecipient}
            />
          )}
        </section>
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
  tab: InboxTab
}) {
  const navigate = Route.useNavigate()
  const sendFirstMessage = useSendFirstMessage()
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    setSendError(null)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [otherUserId])

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return

    setSending(true)
    setSendError(null)
    try {
      const result = await sendFirstMessage({
        otherUserId,
        content: newMessage.trim(),
      })
      setNewMessage('')
      await navigate({
        to: '/inbox',
        // The sender's own conversation always lives in the main inbox
        // (pending until the other person replies), never under requests.
        search: getInboxDestinationSearch(
          String(result.conversationId),
          'inbox',
        ),
      })
    } catch (error) {
      console.error('Send failed', error)
      setSendError(getActionErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-line px-[var(--lx-gutter)]">
        <Button
          variant="ghost"
          size="touch"
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
          className="flex min-w-0 items-center gap-3 rounded-card px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <LxAvatar
            name={recipient.displayName}
            avatarUrl={recipient.avatarUrl ?? undefined}
            size={32}
          />
          <div className="min-w-0">
            <div className="truncate font-sans text-label font-medium text-text">
              {recipient.displayName}
            </div>
            <div className="truncate font-mono text-meta text-text-muted">
              {recipient.cityName ?? 'location hidden'}
            </div>
          </div>
        </button>
      </div>

      <EmptyState
        icon={<Send size={28} strokeWidth={1.2} />}
        title="write the first message"
        description={`say hi to ${recipient.displayName} to start the conversation.`}
      />

      <div className="shrink-0 border-t border-line px-[var(--lx-gutter)] pt-2 pb-[calc(var(--lx-mobile-tab-height)+0.75rem)] md:pt-4 md:pb-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-1.5 rounded-card border border-line bg-surface p-1.5 transition-colors focus-within:border-line-strong md:gap-3 md:border-0 md:bg-transparent md:p-0">
          <Textarea
            ref={textareaRef}
            value={newMessage}
            onChange={(event) => setNewMessage(event.target.value)}
            placeholder="write a message…"
            aria-label="Message"
            rows={1}
            className="max-h-28 min-h-11 min-w-0 border-0 bg-transparent py-2.5 font-sans md:min-h-20 md:border md:bg-surface md:py-2"
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
            variant="primary"
            size="touch"
            className="w-11 px-0 md:w-auto md:px-4"
            aria-label={sending ? 'Sending message' : 'Send message'}
          >
            <Send size={16} aria-hidden="true" className="md:hidden" />
            <span className="hidden md:inline">
              {sending ? 'sending…' : 'send'}
            </span>
          </Button>
        </div>
        {sendError && (
          <p
            role="alert"
            className="mt-2 mb-0 font-mono text-label text-danger"
          >
            {sendError}
          </p>
        )}
      </div>
    </div>
  )
}

function SelectedConversationPanel({
  tab,
  selectedConversation,
  viewerId,
}: {
  tab: InboxTab
  selectedConversation: InboxConversation
  viewerId: string
}) {
  const navigate = Route.useNavigate()
  const sendMessage = useSendMessage()
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
    setSendError(null)
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
    openedConversationRef.current = null
    previousScrollHeightRef.current = null
    shouldStickToBottomRef.current = true
    sentMessagePendingRef.current = false
    lastMessageIdRef.current = null
    setSendError(null)
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
      {/* Wraps on phones: the request status takes its own line so the name
          keeps its width and the composer stays above the tab bar. */}
      <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-[var(--lx-gutter)] py-1">
        <Button
          variant="ghost"
          size="touch"
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

      <div className="shrink-0 border-t border-line px-[var(--lx-gutter)] pt-2 pb-[calc(var(--lx-mobile-tab-height)+0.75rem)] md:pt-4 md:pb-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-1.5 rounded-card border border-line bg-surface p-1.5 transition-colors focus-within:border-line-strong md:gap-3 md:border-0 md:bg-transparent md:p-0">
          <Textarea
            ref={textareaRef}
            value={newMessage}
            onChange={(event) => setNewMessage(event.target.value)}
            placeholder="write a message…"
            aria-label="Message"
            rows={1}
            className="max-h-28 min-h-11 min-w-0 border-0 bg-transparent py-2.5 font-sans md:min-h-20 md:border md:bg-surface md:py-2"
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
            variant="primary"
            size="touch"
            className="w-11 px-0 md:w-auto md:px-4"
            aria-label={sending ? 'Sending message' : 'Send message'}
          >
            <Send size={16} aria-hidden="true" className="md:hidden" />
            <span className="hidden md:inline">
              {sending ? 'sending…' : 'send'}
            </span>
          </Button>
        </div>
        {sendError && (
          <p
            role="alert"
            className="mt-2 mb-0 font-mono text-label text-danger"
          >
            {sendError}
          </p>
        )}
      </div>
    </div>
  )
}
