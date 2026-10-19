import { useId, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { reportActionError } from '@/lib/action-error'
import type { CampaignDraft, EmailCampaignDetail } from '../contracts'
import { useSendEmailTest } from '../mutations'

export interface TestSendPanelProps {
  detail: EmailCampaignDetail
  draft: CampaignDraft
}

/** Sends the current editor content, saved or not, to one allowlisted address. */
export function TestSendPanel({ detail, draft }: TestSendPanelProps) {
  const sendTest = useSendEmailTest()
  const inputId = useId()
  const hintId = useId()
  const [recipient, setRecipient] = useState(detail.defaultTestRecipient ?? '')
  const [sending, setSending] = useState(false)
  const disabled = !detail.testSendingEnabled

  const send = async () => {
    setSending(true)
    try {
      await sendTest({
        subject: draft.subject,
        preheader: draft.preheader,
        content: draft.content,
        recipient: recipient.trim(),
      })
      // Queued in Convex; the email component hands it to Resend shortly.
      toast.success(`Test email queued for ${recipient.trim()}.`)
    } catch (error) {
      reportActionError(error, { title: "couldn't send the test" })
    } finally {
      setSending(false)
    }
  }

  return (
    <form
      className="max-w-lg space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      <p className="text-body text-text-muted">
        Sends what is in the editor now, marked “[test]”, with its unsubscribe
        link pointing at Settings. Up to five tests an hour.
      </p>
      <div>
        <label
          htmlFor={inputId}
          className="mb-1.5 block font-mono text-label text-text-muted"
        >
          Send a test to
        </label>
        <Input
          id={inputId}
          type="email"
          value={recipient}
          aria-describedby={hintId}
          disabled={disabled}
          onChange={(event) => setRecipient(event.target.value)}
        />
        <p id={hintId} className="mt-1.5 font-mono text-meta text-text-muted">
          {disabled
            ? 'Test emails are off in this environment.'
            : detail.testRecipients.length > 0
              ? `Allowed: ${detail.testRecipients.join(', ')}`
              : 'No addresses are allowed for tests yet.'}
        </p>
      </div>
      <Button type="submit" disabled={disabled || sending || !recipient.trim()}>
        {sending ? 'Sending…' : 'Send test'}
      </Button>
    </form>
  )
}
