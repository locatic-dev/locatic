import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { reportActionError } from '@/lib/action-error'
import { type EmailCampaignDetail, SEND_DELAY_MS } from '../contracts'
import { useUnscheduleEmailSend } from '../mutations'
import { formatSendTime } from './send-dialog'

/** Ticks every second while `active`. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

function formatCountdown(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1_000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * A campaign waiting for its send time: a countdown with Undo for Send, or
 * the time with Cancel for Send later. Either returns it to draft.
 */
export function ScheduledPanel({ detail }: { detail: EmailCampaignDetail }) {
  const unscheduleSend = useUnscheduleEmailSend()
  const [busy, setBusy] = useState(false)
  const sendAt = detail.scheduled?.sendAt ?? 0
  // Within the undo window it reads as "Sending in 0:27"; further out, as
  // a scheduled time.
  const soon = sendAt - Date.now() <= SEND_DELAY_MS + 5_000
  const now = useNow(soon)
  const remaining = sendAt - now

  const undo = async () => {
    setBusy(true)
    try {
      await unscheduleSend({
        campaignId: detail.id,
        expectedRevision: detail.revision,
      })
      toast.success(soon ? 'Send undone.' : 'Scheduled send cancelled.')
    } catch (error) {
      reportActionError(error, { title: "couldn't undo" })
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="scheduled-title" className="space-y-4">
      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line px-3 py-3"
      >
        <div>
          <h2 id="scheduled-title" className="text-title text-text">
            {soon
              ? remaining > 0
                ? `Sending in ${formatCountdown(remaining)}`
                : 'Starting…'
              : `Scheduled for ${formatSendTime(sendAt)}`}
          </h2>
          <p className="mt-1 font-mono text-meta text-text-muted">
            {detail.scheduled?.copyTo
              ? `A copy goes to ${detail.scheduled.copyTo}.`
              : 'No copy.'}
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          disabled={busy || (soon && remaining <= 0)}
          onClick={() => void undo()}
        >
          {soon ? 'Undo' : 'Cancel and edit'}
        </Button>
      </div>
      <p className="text-body text-text-muted">
        {`Editing is locked until it sends or you ${soon ? 'undo' : 'cancel'} it.`}
      </p>
    </section>
  )
}
