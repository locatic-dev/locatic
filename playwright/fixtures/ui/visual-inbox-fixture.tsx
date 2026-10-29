import { useState } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import { ConversationList } from '@/features/inbox/conversation-list'
import type { InboxConversation } from '@/features/inbox/navigation'
import { SelectedConversationView } from '@/features/inbox/selected-conversation-panel'
import { InboxPanes } from '@/features/inbox/inbox-panes'
import { EmptyState } from '@/components/ui/empty-state'

// All identities, locations, and messages are invented here. No remote avatars,
// provider identities, environment variables, or member data enter this fixture.
const viewerId = 'synthetic-viewer' as Id<'users'>
const peerId = 'synthetic-peer' as Id<'users'>
const conversation: InboxConversation = {
  _id: 'synthetic-conversation' as Id<'conversations'>,
  _creationTime: 1,
  conversationKey: `${viewerId}:${peerId}`,
  participantLowId: viewerId,
  participantHighId: peerId,
  lastMessage: {
    content: 'Synthetic message for visual testing.',
    senderId: peerId,
    sentAt: Date.UTC(2030, 0, 1, 12),
  },
  unreadCounts: { [viewerId]: 1 },
  isRequest: false,
  createdAt: 1,
  updatedAt: 1,
  otherUser: {
    userId: peerId,
    githubUsername: 'synthetic-builder',
    displayName: 'Demo Builder',
    cityName: 'Example City',
    avatarUrl: null,
  },
  status: 'active',
}

export function VisualInboxFixture() {
  const [selected, setSelected] = useState(false)
  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-line p-4">
        <h1 className="m-0 text-headline">inbox</h1>
        <p className="m-0 font-mono text-meta text-text-muted">
          synthetic visual fixture
        </p>
      </header>
      <InboxPanes
        view={selected ? 'thread' : 'list'}
        list={
          <ConversationList
            conversations={[conversation]}
            activeTab="inbox"
            viewerId={viewerId}
            selectedId={selected ? conversation._id : null}
            onOpenProfile={() => {}}
            onSelectConversation={() => setSelected(true)}
          />
        }
      >
        {selected ? (
          <SelectedConversationView
            selectedConversation={conversation}
            viewerId={viewerId}
            onBack={() => setSelected(false)}
            onOpenProfile={() => {}}
            onMarkRead={() => {}}
            sendMessage={async () => {}}
            messagesPage={{
              status: 'Exhausted',
              loadMore: () => {},
              results: [
                {
                  _id: 'synthetic-message' as Id<'messages'>,
                  _creationTime: 1,
                  conversationId: conversation._id,
                  senderId: peerId,
                  content: conversation.lastMessage.content,
                  readAt: null,
                  createdAt: conversation.lastMessage.sentAt,
                },
              ],
            }}
          />
        ) : (
          <EmptyState
            title="select a conversation"
            description="pick a thread from the list to read and reply."
          />
        )}
      </InboxPanes>
    </main>
  )
}

// The app sidebar consumes the same token width here, without importing auth.
export function ResponsiveInboxFixture() {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="flex">
      <aside
        className={`hidden h-dvh shrink-0 border-r border-line md:block ${collapsed ? 'w-19' : 'w-(--lx-sidebar-width)'}`}
      >
        <button className="min-h-11" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? 'expand sidebar' : 'collapse sidebar'}
        </button>
      </aside>
      <div className="min-w-0 flex-1">
        <VisualInboxFixture />
      </div>
    </div>
  )
}
