import { useEffect, useRef, useState } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import { useSendFirstMessage } from './mutations'
import type { InboxConversation } from './navigation'
import { MessageComposer } from './message-composer'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Send } from '@/lib/icons'
import { getActionErrorMessage } from '@/lib/action-error'

type Props = {
  recipient: NonNullable<InboxConversation['otherUser']>
  onBack: () => void
  onOpenProfile: (username: string) => void
  onConversationCreated: (id: Id<'conversations'>) => void | Promise<void>
}

export function DraftConversationPanel(props: Props) {
  const sendFirstMessage = useSendFirstMessage()
  return (
    <DraftConversationView
      key={props.recipient.userId}
      {...props}
      sendMessage={async (content) => {
        const result = await sendFirstMessage({
          otherUserId: props.recipient.userId,
          content,
        })
        return result.conversationId
      }}
    />
  )
}

export function DraftConversationView({
  recipient,
  onBack,
  onOpenProfile,
  onConversationCreated,
  sendMessage,
}: Props & {
  sendMessage: (content: string) => Promise<Id<'conversations'>>
}) {
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const isMountedRef = useRef(false)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const frame = requestAnimationFrame(() => textareaRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [recipient.userId])

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return

    setSending(true)
    setSendError(null)
    try {
      const conversationId = await sendMessage(newMessage.trim())
      // The send still belongs to its original recipient after navigation.
      if (!isMountedRef.current) return
      setNewMessage('')
      await onConversationCreated(conversationId)
    } catch (error) {
      if (!isMountedRef.current) return
      console.error('Send failed', error)
      setSendError(getActionErrorMessage(error))
    } finally {
      if (isMountedRef.current) setSending(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-line px-[var(--lx-gutter)]">
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
          onClick={() => onOpenProfile(recipient.githubUsername)}
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
