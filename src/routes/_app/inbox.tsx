import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  conversationDetailQueryOptions,
  conversationsQueryOptions,
} from '@/features/inbox/queries'
import {
  useMarkConversationRead,
  useSendMessage,
} from '@/features/inbox/mutations'
import { privateProfileQueryOptions } from '@/features/profile/queries'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { relativeTime } from '@/lib/time'
import { Inbox } from '@/lib/icons'
import {
  mapConversationDetail,
  mapConversationList,
  mapPrivateProfile,
  type ConversationDetailPayload,
  type EnrichedConversation,
  type PrivateProfilePayload,
} from '@/features/contracts'

export const Route = createFileRoute('/_app/inbox')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: ((search.tab as string) === 'requests' ? 'requests' : 'inbox') as
      | 'inbox'
      | 'requests',
    conversation: (search.conversation as string) ?? null,
  }),
  component: InboxPage,
})

function InboxPage() {
  const { tab, conversation: selectedId } = useSearch({ from: '/_app/inbox' })
  const navigate = useNavigate()
  const profileQuery = useQuery(privateProfileQueryOptions())
  const profile = mapPrivateProfile(
    profileQuery.data as PrivateProfilePayload | undefined,
  )
  const viewerId = profile?.viewer.id

  const convsQuery = useQuery(conversationsQueryOptions())
  const detailQuery = useQuery({
    ...conversationDetailQueryOptions(selectedId as never),
    enabled: Boolean(selectedId),
  })
  const sendMessage = useSendMessage()
  const markConversationRead = useMarkConversationRead()

  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)

  const allConversations = mapConversationList(
    convsQuery.data as Array<EnrichedConversation> | undefined,
  )
  const conversations = allConversations.filter((conversation) =>
    tab === 'requests' ? conversation.isRequest : !conversation.isRequest,
  )
  const selectedConversation =
    conversations.find(
      (conversation) => String(conversation._id) === selectedId,
    ) ?? null
  const conversationDetail = mapConversationDetail(
    detailQuery.data as ConversationDetailPayload | undefined,
  )
  const messages = conversationDetail?.messages ?? []

  useEffect(() => {
    if (!selectedConversation || !viewerId) return

    const unreadCount = selectedConversation.unreadCounts[String(viewerId)] ?? 0
    if (unreadCount <= 0) return

    void markConversationRead({
      conversationId: selectedConversation._id,
    })
  }, [markConversationRead, selectedConversation, viewerId])

  const handleSend = async () => {
    if (!newMessage.trim() || sending || !selectedConversation) return

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
        style={{ borderBottom: '1px solid var(--lx-border)', flexShrink: 0 }}
      >
        <div
          style={{
            height: 56,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
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
            inbox
          </h1>
        </div>
        <div style={{ padding: '0 24px', display: 'flex', gap: 0 }}>
          {tabItems.map((tabItem) => (
            <button
              key={tabItem.id}
              onClick={() =>
                void navigate({
                  to: '/inbox',
                  search: { tab: tabItem.id } as never,
                } as never)
              }
              style={{
                padding: '10px 16px',
                position: 'relative',
                cursor: 'pointer',
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 12,
                color:
                  tab === tabItem.id ? 'var(--lx-text)' : 'var(--lx-text-3)',
                fontWeight: tab === tabItem.id ? 600 : 400,
                background: 'none',
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
              }}
              type="button"
            >
              {tabItem.label}
              {tabItem.count > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    padding: '1px 5px',
                    borderRadius: 8,
                    background: 'var(--lx-surface-alt)',
                    color: 'var(--lx-text-3)',
                    lineHeight: 1.3,
                  }}
                >
                  {tabItem.count}
                </span>
              )}
              {tab === tabItem.id && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: -1,
                    left: 8,
                    right: 8,
                    height: 2,
                    background: 'var(--lx-accent)',
                  }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div
          style={{
            width: 320,
            borderRight: '1px solid var(--lx-border)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {conversations.length === 0 && (
              <div
                style={{
                  padding: '32px 20px',
                  textAlign: 'center',
                  fontFamily: 'var(--lx-font-mono)',
                  fontSize: 12,
                  color: 'var(--lx-text-3)',
                }}
              >
                {tab === 'requests'
                  ? 'no message requests.'
                  : 'no conversations yet.'}
              </div>
            )}

            {conversations.map((conversation) => {
              const unreadCount =
                viewerId && conversation.unreadCounts[String(viewerId)]
                  ? conversation.unreadCounts[String(viewerId)]
                  : 0
              const isSelected = selectedId === String(conversation._id)

              return (
                <button
                  key={String(conversation._id)}
                  onClick={() =>
                    void navigate({
                      to: '/inbox',
                      search: {
                        tab,
                        conversation: String(conversation._id),
                      } as never,
                    } as never)
                  }
                  style={{
                    width: '100%',
                    padding: '14px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    background: isSelected
                      ? 'var(--lx-surface-alt)'
                      : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--lx-border)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  type="button"
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
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--lx-font-mono)',
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: 'var(--lx-text)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {conversation.otherUser?.displayName ??
                          conversation.otherUser?.githubUsername ??
                          'Unknown user'}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--lx-font-mono)',
                          fontSize: 10.5,
                          color: 'var(--lx-text-3)',
                          flexShrink: 0,
                          marginLeft: 8,
                        }}
                      >
                        {relativeTime(conversation.lastMessage.sentAt)}
                      </span>
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--lx-font-sans)',
                        fontSize: 12,
                        color: 'var(--lx-text-2)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {conversation.lastMessage.content}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: 6,
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--lx-font-mono)',
                          fontSize: 10.5,
                          color: 'var(--lx-text-3)',
                        }}
                      >
                        {conversation.otherUser?.cityName ?? 'location hidden'}
                      </span>
                      {unreadCount > 0 && (
                        <span
                          style={{
                            fontFamily: 'var(--lx-font-mono)',
                            fontSize: 10,
                            padding: '1px 6px',
                            borderRadius: 999,
                            background: 'var(--lx-accent)',
                            color: '#0d1117',
                            lineHeight: 1.4,
                          }}
                        >
                          {unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {!selectedConversation && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
                color: 'var(--lx-text-3)',
              }}
            >
              <Inbox size={36} strokeWidth={1.2} />
              <span style={{ fontFamily: 'var(--lx-font-mono)', fontSize: 12 }}>
                select a conversation to read messages.
              </span>
            </div>
          )}

          {selectedConversation && (
            <>
              <div
                style={{
                  height: 56,
                  padding: '0 24px',
                  borderBottom: '1px solid var(--lx-border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexShrink: 0,
                }}
              >
                <LxAvatar
                  name={
                    selectedConversation.otherUser?.displayName ??
                    selectedConversation.otherUser?.githubUsername ??
                    'user'
                  }
                  avatarUrl={
                    selectedConversation.otherUser?.avatarUrl ?? undefined
                  }
                  size={32}
                />
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--lx-font-mono)',
                      fontSize: 12.5,
                      color: 'var(--lx-text)',
                      fontWeight: 600,
                    }}
                  >
                    {selectedConversation.otherUser?.displayName ??
                      selectedConversation.otherUser?.githubUsername ??
                      'Unknown user'}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--lx-font-mono)',
                      fontSize: 10.5,
                      color: 'var(--lx-text-3)',
                    }}
                  >
                    {selectedConversation.otherUser?.cityName ??
                      'location hidden'}
                  </div>
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '24px 24px 32px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                {messages.map((message) => {
                  const isMe = viewerId === message.senderId
                  return (
                    <div
                      key={String(message._id)}
                      style={{
                        display: 'flex',
                        justifyContent: isMe ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '75%',
                          padding: '10px 12px',
                          borderRadius: 8,
                          background: isMe
                            ? 'var(--lx-accent)'
                            : 'var(--lx-surface)',
                          color: isMe ? '#0d1117' : 'var(--lx-text)',
                          border: isMe ? 'none' : '1px solid var(--lx-border)',
                        }}
                      >
                        <div
                          style={{
                            fontFamily: 'var(--lx-font-sans)',
                            fontSize: 13.5,
                            lineHeight: 1.5,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {message.content}
                        </div>
                        <div
                          style={{
                            marginTop: 6,
                            fontFamily: 'var(--lx-font-mono)',
                            fontSize: 10.5,
                            color: isMe ? '#0d1117' : 'var(--lx-text-3)',
                            opacity: isMe ? 0.8 : 1,
                          }}
                        >
                          {relativeTime(message.createdAt)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div
                style={{
                  padding: '16px 24px 20px',
                  borderTop: '1px solid var(--lx-border)',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-end',
                  flexShrink: 0,
                }}
              >
                <Textarea
                  value={newMessage}
                  onChange={(event) => setNewMessage(event.target.value)}
                  placeholder="write a message…"
                  rows={2}
                  style={{
                    resize: 'none',
                    background: 'var(--lx-surface)',
                    borderColor: 'var(--lx-border)',
                    color: 'var(--lx-text)',
                    fontFamily: 'var(--lx-font-sans)',
                  }}
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
                  style={{
                    background: 'var(--lx-accent)',
                    color: '#0d1117',
                    border: 'none',
                    fontFamily: 'var(--lx-font-mono)',
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  {sending ? 'sending…' : 'send'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
