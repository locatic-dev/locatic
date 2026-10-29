import { useState } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import type { InboxConversation } from '@/features/inbox/navigation'
import { DraftConversationView } from '@/features/inbox/draft-conversation-panel'
import { SelectedConversationView } from '@/features/inbox/selected-conversation-panel'
import type { ConversationMessages } from '@/features/inbox/selected-conversation-panel'
import { AccountRecoveryView } from '@/features/viewer/account-recovery-view'

const viewer = 'fixture-viewer' as Id<'users'>
const recipients = {
  ana: {
    userId: 'fixture-ana' as Id<'users'>,
    githubUsername: 'ana',
    displayName: 'Ana Montgomery-Chandrasekhar',
    avatarUrl: null,
    cityName: null,
  },
  bo: {
    userId: 'fixture-bo' as Id<'users'>,
    githubUsername: 'bo',
    displayName: 'Bo',
    avatarUrl: null,
    cityName: null,
  },
}
type Person = keyof typeof recipients
const conversationId = (person: Person) =>
  `fixture-${person}` as Id<'conversations'>
const message = (
  person: Person,
  content: string,
  mine = false,
): ConversationMessages['results'][number] => ({
  _id: `message-${content}` as Id<'messages'>,
  _creationTime: 1,
  conversationId: conversationId(person),
  senderId: mine ? viewer : recipients[person].userId,
  content,
  readAt: null,
  createdAt: Date.now(),
})

// Production interactive views with an explicit memory adapter. No provider
// accounts, authentication, remote queries or real member messages are used.
export function InboxFixture() {
  const [person, setPerson] = useState<Person>('ana')
  const [mode, setMode] = useState<'draft' | 'conversation'>('draft')
  const [threads, setThreads] = useState<
    Record<Person, ConversationMessages['results']>
  >({ ana: [message('ana', 'A recent message')], bo: [] })
  const [unavailable, setUnavailable] = useState(false)
  const [olderLoaded, setOlderLoaded] = useState(false)
  const [holdSends, setHoldSends] = useState(false)
  const [finishSend, setFinishSend] = useState<(() => void) | null>(null)
  const [navigation, setNavigation] = useState('')
  const recipient = recipients[person]
  const conversation: InboxConversation = {
    _id: conversationId(person),
    _creationTime: 1,
    conversationKey: `${viewer}:${recipient.userId}`,
    participantLowId: viewer,
    participantHighId: recipient.userId,
    lastMessage: {
      content: 'Fixture conversation',
      senderId: recipient.userId,
      sentAt: 1,
    },
    unreadCounts: { [viewer]: 0, [recipient.userId]: 0 },
    isRequest: false,
    createdAt: 1,
    updatedAt: 1,
    otherUser: unavailable
      ? { ...recipient, githubUsername: '', displayName: 'account unavailable' }
      : recipient,
    status: 'active',
  }
  const send = async (content: string) => {
    if (holdSends)
      await new Promise<void>((resolve) => setFinishSend(() => resolve))
    setThreads((current) => ({
      ...current,
      [person]: [message(person, content, true), ...current[person]],
    }))
    return conversationId(person)
  }
  const back = () => {
    setMode('draft')
    setNavigation('back to inbox')
  }
  const openProfile = (username: string) => setNavigation(`profile ${username}`)
  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <nav
        aria-label="Inbox QA controls"
        className="flex shrink-0 flex-wrap gap-2 border-b border-line p-2 text-label"
      >
        <button
          className="min-h-11"
          onClick={() => {
            setPerson('ana')
            setMode('draft')
          }}
        >
          draft Ana
        </button>
        <button
          className="min-h-11"
          onClick={() => {
            setPerson('bo')
            setMode('draft')
          }}
        >
          draft Bo
        </button>
        <button
          className="min-h-11"
          onClick={() => {
            setPerson('ana')
            setMode('conversation')
          }}
        >
          open conversation
        </button>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={unavailable}
            onChange={(event) => setUnavailable(event.target.checked)}
          />
          recipient unavailable
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={holdSends}
            onChange={(event) => setHoldSends(event.target.checked)}
          />
          hold sends
        </label>
        <button
          className="min-h-11"
          disabled={!finishSend}
          onClick={() => {
            finishSend?.()
            setFinishSend(null)
          }}
        >
          complete send
        </button>
      </nav>
      {navigation && (
        <p role="status" className="m-0 p-2 text-label">
          {navigation}
        </p>
      )}
      {mode === 'draft' ? (
        <DraftConversationView
          key={`draft-${person}`}
          recipient={recipient}
          onBack={back}
          onOpenProfile={openProfile}
          sendMessage={send}
          onConversationCreated={(id) => {
            setNavigation(`opened ${id}`)
            setMode('conversation')
          }}
        />
      ) : (
        <SelectedConversationView
          key={`conversation-${person}`}
          selectedConversation={conversation}
          viewerId={viewer}
          onBack={back}
          onOpenProfile={openProfile}
          sendMessage={send}
          onMarkRead={() => {}}
          messagesPage={{
            results: threads[person],
            status: olderLoaded ? 'Exhausted' : 'CanLoadMore',
            loadMore: () => {
              setOlderLoaded(true)
              setThreads((current) => ({
                ...current,
                [person]: [
                  ...current[person],
                  message(person, 'An older message'),
                ],
              }))
            },
          }}
        />
      )}
    </main>
  )
}

export function RecoveryFixture() {
  const [restored, setRestored] = useState(false)
  const [signedOut, setSignedOut] = useState(false)
  if (restored || signedOut)
    return (
      <main>
        <h1>{restored ? 'account restored' : 'signed out'}</h1>
      </main>
    )
  return (
    <AccountRecoveryView
      state={{
        status: 'deletion_pending',
        canRestore: true,
        purgeAfter: Date.UTC(2030, 1, 1, 12),
      }}
      onRestore={async () => setRestored(true)}
      onSignOut={() => setSignedOut(true)}
    />
  )
}
