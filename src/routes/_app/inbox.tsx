import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import {
  conversationDetailQueryOptions,
  conversationsQueryOptions,
} from '@/features/inbox/queries'
import {
  useMarkConversationRead,
  useSendMessage,
} from '@/features/inbox/mutations'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { relativeTime } from '@/lib/time'
import { Inbox } from '@/lib/icons'
import {
  mapConversationDetail,
  mapConversationList,
  mapViewerBootstrap,
  type ConversationDetailPayload,
  type EnrichedConversation,
  type ViewerBootstrapPayload,
} from '@/features/contracts'
import { viewerQueryOptions } from '@/features/viewer/queries'
import { InboxRoutePending } from '@/components/app-shell/route-pending'

export const Route = createFileRoute('/_app/inbox')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: ((search.tab as string) === 'requests' ? 'requests' : 'inbox') as
      | 'inbox'
      | 'requests',
    conversation:
      typeof search.conversation === 'string' ? search.conversation : null,
  }),
  loaderDeps: ({ search }) => ({
    conversationId: search.conversation,
  }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(conversationsQueryOptions()),
      context.queryClient.ensureQueryData(viewerQueryOptions()),
    ])

    if (deps.conversationId) {
      await context.queryClient.ensureQueryData(
        conversationDetailQueryOptions(
          deps.conversationId as Id<'conversations'>,
        ),
      )
    }
  },
  pendingComponent: InboxRoutePending,
  pendingMs: 250,
  component: InboxPage,
})

function InboxPage() {
  const { tab, conversation: selectedId } = Route.useSearch()
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
    <div className="lx-page-shell min-h-0 overflow-hidden">
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
                  search: { tab: tabItem.id, conversation: null },
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
            selectedConversation
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
                          tab,
                          conversation: String(conversation._id),
                        },
                      })
                    }
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
                        <span className="rounded-pill bg-brand px-1.5 py-px font-mono text-[10px] leading-[1.4] text-brand-foreground">
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

        <div className="flex flex-1 flex-col">
          {!selectedConversation && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3.5 text-text-faint">
              <Inbox size={36} strokeWidth={1.2} />
              <span className="font-mono text-xs">
                select a conversation to read messages.
              </span>
            </div>
          )}

          {selectedConversation && viewerId && (
            <SelectedConversationPanel
              tab={tab}
              selectedConversation={selectedConversation}
              viewerId={viewerId}
            />
          )}
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
  const { data } = useSuspenseQuery(
    conversationDetailQueryOptions(selectedConversation._id),
  )
  const conversationDetail = mapConversationDetail(
    data as ConversationDetailPayload | undefined,
  )
  const sendMessage = useSendMessage()
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)

  const messages = conversationDetail?.messages ?? []

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return

    setSending(true)
    try {
      await sendMessage({
        conversationId: selectedConversation._id,
        content: newMessage.trim(),
      })
      setNewMessage('')
    } catch (error) {
      console.error('Send failed', error)
    } finally {
      setSending(false)
    }
  }

  const otherUsername = selectedConversation.otherUser?.githubUsername
  const otherDisplayName =
    selectedConversation.otherUser?.displayName ??
    selectedConversation.otherUser?.githubUsername ??
    'Unknown user'

  return (
    <>
      <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-line px-[var(--lx-gutter)]">
        <Button
          variant="ghost"
          onClick={() =>
            void navigate({
              to: '/inbox',
              search: { tab, conversation: null },
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

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-[var(--lx-gutter)] pt-6 pb-8">
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
                    ? 'bg-brand text-brand-foreground'
                    : 'border border-line bg-surface text-text'
                }`}
              >
                <div className="whitespace-pre-wrap font-sans text-[13.5px] leading-6">
                  {message.content}
                </div>
                <div
                  className={`mt-1.5 font-mono text-[10.5px] ${
                    isMe ? 'text-brand-foreground/80' : 'text-text-faint'
                  }`}
                >
                  {relativeTime(message.createdAt)}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex shrink-0 flex-wrap items-end gap-3 border-t border-line px-[var(--lx-gutter)] pt-4 pb-5">
        <Textarea
          value={newMessage}
          onChange={(event) => setNewMessage(event.target.value)}
          placeholder="write a message…"
          rows={2}
          className="resize-none border-line bg-surface font-sans text-text"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void handleSend()
            }
          }}
        />
        <Button
          onClick={() => void handleSend()}
          disabled={!newMessage.trim() || sending}
          className="min-h-11 border-none bg-brand font-mono text-[12.5px] font-semibold text-brand-foreground hover:bg-brand/90"
        >
          {sending ? 'sending…' : 'send'}
        </Button>
      </div>
    </>
  )
}
