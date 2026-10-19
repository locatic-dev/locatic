import { usePaginatedQuery } from 'convex/react'
import { useEffect, useState } from 'react'

import { api } from '../../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import {
  CAMPAIGN_STATE_LABELS,
  type EmailCampaignDetail,
  formatBoundedCount,
  isStalled,
  SEND_STATUS_HINTS,
  SEND_STATUS_LABELS,
  SEND_STATUS_ORDER,
} from '../contracts'

const RECIPIENT_PAGE_SIZE = 25
const sectionTitleClassName = 'text-eyebrow text-text-muted'

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
}

/** Re-renders every 30 s while a send runs, so Resume appears when stalled. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

export interface CampaignResultsProps {
  detail: EmailCampaignDetail
  onCancel: () => Promise<void>
  onResume: () => Promise<void>
}

/** Read-only results for a campaign that started sending. */
export function CampaignResults({
  detail,
  onCancel,
  onResume,
}: CampaignResultsProps) {
  const now = useNow(detail.state === 'sending')
  const [busy, setBusy] = useState<'cancel' | 'resume' | null>(null)
  const recipients = usePaginatedQuery(
    api.emailCampaigns.listRecipients,
    { campaignId: detail.id },
    { initialNumItems: RECIPIENT_PAGE_SIZE },
  )
  const results = detail.results
  const waiting = results?.counts.queued ?? { count: 0, capped: false }
  const stalled = isStalled(detail, now)
  // While sending, Cancel also stops the remaining members from being
  // visited; afterwards it only cancels emails not handed over yet.
  const stillSending = detail.state === 'sending'
  const cancelCopy = stillSending
    ? {
        label: 'Stop sending',
        confirm:
          "Stop sending to anyone else? Emails waiting to go out are cancelled too; emails that have already left Locatic can't be recalled.",
      }
    : {
        label: 'Cancel emails not sent yet',
        confirm:
          "Cancel the emails that haven't gone out yet? Emails that have already left Locatic can't be recalled.",
      }

  const run = async (
    kind: 'cancel' | 'resume',
    action: () => Promise<void>,
  ) => {
    setBusy(kind)
    try {
      await action()
    } finally {
      setBusy(null)
    }
  }

  return (
    <section aria-labelledby="campaign-results-title" className="space-y-6">
      <div>
        <h2 id="campaign-results-title" className="text-title text-text">
          {detail.subject || detail.title}
        </h2>
        <p className="mt-1 font-mono text-meta text-text-muted">
          {CAMPAIGN_STATE_LABELS[detail.state]}
          {detail.sending
            ? ` · started ${formatTime(detail.sending.startedAt)}`
            : null}
          {results
            ? ` · ${formatBoundedCount(results.total)} ${
                results.total.count === 1 && !results.total.capped
                  ? 'recipient'
                  : 'recipients'
              }`
            : null}
        </p>
      </div>

      {stalled ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line px-3 py-2"
        >
          <p className="text-body text-text">
            Sending stopped. Resume picks up where it left off; no one gets the
            email twice.
          </p>
          <Button
            type="button"
            variant="primary"
            disabled={busy !== null}
            onClick={() => void run('resume', onResume)}
          >
            Resume sending
          </Button>
        </div>
      ) : null}

      {results ? (
        <ul
          aria-label="Results by status"
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {SEND_STATUS_ORDER.map((status) => (
            <li key={status} className="border-l border-line pl-3">
              <span className="block font-mono text-meta text-text-muted">
                {SEND_STATUS_LABELS[status]}
              </span>
              <span className="block font-mono text-body font-semibold text-text">
                {formatBoundedCount(results.counts[status])}
              </span>
              <span className="block text-meta text-text-muted">
                {SEND_STATUS_HINTS[status]}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {stillSending || waiting.count > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-body text-text-muted">
            {stillSending
              ? `Still going through members${
                  waiting.count > 0
                    ? `; ${formatBoundedCount(waiting)} waiting to send`
                    : ''
                }.`
              : `${formatBoundedCount(waiting)} waiting to send.`}
          </p>
          <Button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              if (!window.confirm(cancelCopy.confirm)) return
              void run('cancel', onCancel)
            }}
          >
            {cancelCopy.label}
          </Button>
        </div>
      ) : null}

      <div>
        <h3 className={sectionTitleClassName}>recipients</h3>
        {recipients.results.length === 0 ? (
          <p className="mt-3 text-body text-text-muted">No recipients yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line font-mono text-meta text-text-muted">
                  <th scope="col" className="py-2 pr-4 font-normal">
                    name
                  </th>
                  <th scope="col" className="py-2 pr-4 font-normal">
                    address
                  </th>
                  <th scope="col" className="py-2 pr-4 font-normal">
                    status
                  </th>
                  <th scope="col" className="py-2 font-normal">
                    updated
                  </th>
                </tr>
              </thead>
              <tbody>
                {recipients.results.map((recipient) => (
                  <tr key={recipient.id} className="border-b border-line">
                    <td className="py-2 pr-4">
                      <span className="block text-label text-text">
                        {recipient.displayName}
                      </span>
                      {recipient.githubUsername ? (
                        <span className="block font-mono text-meta text-text-muted">
                          @{recipient.githubUsername}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4 font-mono text-meta break-all text-text-muted">
                      {recipient.to ?? '—'}
                    </td>
                    <td className="py-2 pr-4 font-mono text-meta text-text">
                      {SEND_STATUS_LABELS[recipient.status]}
                    </td>
                    <td className="py-2 font-mono text-meta text-text-muted">
                      {formatTime(recipient.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {recipients.status === 'CanLoadMore' ? (
          <Button
            type="button"
            size="sm"
            className="mt-3"
            onClick={() => recipients.loadMore(RECIPIENT_PAGE_SIZE)}
          >
            Show more
          </Button>
        ) : null}
      </div>
    </section>
  )
}
