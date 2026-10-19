import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import type { Id } from '../../../../convex/_generated/dataModel'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { PersonRow } from '@/components/ui/person-row'
import { getActionErrorMessage } from '@/lib/action-error'
import {
  audienceLabel,
  EMAIL_LIMITS,
  type EmailCampaignKind,
  type EmailCopyAddresses,
  type EmailCopyChoice,
  formatCount,
  skippedSummary,
} from '../contracts'
import { emailSendPreviewQueryOptions } from '../queries'

export interface SendRequest {
  copy: EmailCopyChoice
  /** Send later; absent for Send (30 seconds, so it can be undone). */
  sendAt?: number
}

export interface SendDialogProps {
  campaignId: Id<'email_campaigns'>
  subject: string
  kind: EmailCampaignKind
  copyAddresses: EmailCopyAddresses
  /** Why sending is not possible right now (unsaved edits, sending off). */
  blockedReason: string | null
  onSend: (request: SendRequest) => Promise<void>
}

const MINUTE_MS = 60_000
const SEND_LATER_MAX_MS = 30 * 24 * 60 * MINUTE_MS

/** `datetime-local` value (the browser's time zone) for a timestamp. */
function toLocalInput(timestamp: number) {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** "Oct 21, 2026, 9:00 AM GMT+5:30", in the browser's time zone. */
export function formatSendTime(timestamp: number) {
  // `timeZoneName` cannot be combined with dateStyle/timeStyle.
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(timestamp)
}

/**
 * The confirmation step. The audience is counted live when it opens and
 * counted again, member by member, while sending, so the number is an
 * estimate (design D3).
 */
export function SendDialog({
  campaignId,
  subject,
  kind,
  copyAddresses,
  blockedReason,
  onSend,
}: SendDialogProps) {
  const fieldId = useId()
  const [open, setOpen] = useState(false)
  const [copy, setCopy] = useState<EmailCopyChoice>('archive')
  const [when, setWhen] = useState<'now' | 'later'>('now')
  // A `datetime-local` value, read in the browser's time zone.
  const [laterValue, setLaterValue] = useState('')
  const laterAt = laterValue ? new Date(laterValue).getTime() : Number.NaN
  const laterProblem =
    when !== 'later'
      ? null
      : Number.isNaN(laterAt)
        ? 'Pick a date and time.'
        : laterAt < Date.now() + MINUTE_MS
          ? 'Pick a time at least a minute from now.'
          : laterAt > Date.now() + SEND_LATER_MAX_MS
            ? 'Pick a time within 30 days.'
            : null
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewQuery = useQuery(emailSendPreviewQueryOptions(campaignId, open))
  const preview = previewQuery.data
  // A capped estimate counted only the first members, so a capped zero is
  // incomplete and must not block sending; only an uncapped zero does.
  const nobody = preview?.estimatedCount === 0
  const count = preview && !nobody ? audienceLabel(preview) : null
  const noun =
    preview?.estimatedCount === 1 && !preview.capped ? 'person' : 'people'
  const skipped = preview ? skippedSummary(preview.skipped, kind) : ''
  const more = preview ? preview.estimatedCount - preview.sample.length : 0
  const canSend =
    !blockedReason &&
    !laterProblem &&
    !sending &&
    !!preview &&
    (preview.capped || preview.estimatedCount > 0)
  const confirmLabel = sending
    ? 'Scheduling…'
    : when === 'later'
      ? laterProblem
        ? 'Schedule'
        : `Schedule for ${formatSendTime(laterAt)}`
      : !preview
        ? 'Send to …'
        : count
          ? `Send to ${count} ${noun}`
          : preview.capped
            ? 'Send to everyone eligible'
            : 'Send to 0 people'

  const confirm = async () => {
    if (!canSend) return
    setSending(true)
    setError(null)
    try {
      await onSend({ copy, ...(when === 'later' ? { sendAt: laterAt } : {}) })
      setOpen(false)
    } catch (sendError) {
      setError(getActionErrorMessage(sendError))
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setError(null)
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="primary">
          Review and send
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {count
              ? `Send “${subject}” to about ${count} ${noun}?`
              : `Send “${subject}”?`}
          </DialogTitle>
          <DialogDescription>
            {preview?.capped
              ? `Counted from the first ${formatCount(EMAIL_LIMITS.sendPreviewMembers)} members only; sending checks every member. `
              : 'This number is an estimate. '}
            Members who change their settings before their email goes out are
            skipped, and the results show who actually received it.
          </DialogDescription>
        </DialogHeader>

        {preview ? (
          <div className="space-y-3">
            {preview.sample.length > 0 ? (
              <ul className="space-y-2" aria-label="Some of the recipients">
                {preview.sample.map((person) => (
                  <li key={person.githubUsername}>
                    <PersonRow
                      avatarName={person.displayName}
                      size={28}
                      title={person.displayName}
                      meta={`@${person.githubUsername}`}
                    />
                  </li>
                ))}
              </ul>
            ) : preview.capped ? (
              <p className="text-body text-text-muted">
                None of the first {formatCount(EMAIL_LIMITS.sendPreviewMembers)}{' '}
                members would receive it. Sending checks everyone else too.
              </p>
            ) : (
              <p className="text-body text-text-muted">
                No one would receive this email right now.
              </p>
            )}
            {more > 0 ? (
              <p className="font-mono text-meta text-text-muted">
                and {formatCount(more)}
                {preview.capped ? '+' : ''} more
              </p>
            ) : null}
            {skipped ? (
              <p className="font-mono text-meta text-text-muted">
                Not sending to {skipped}
              </p>
            ) : null}
          </div>
        ) : previewQuery.error ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-body text-text">Couldn't count recipients.</p>
            <Button type="button" onClick={() => void previewQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <p className="text-body text-text-muted" role="status">
            Counting recipients…
          </p>
        )}

        <fieldset className="space-y-2">
          <legend className="mb-1.5 font-mono text-label text-text-muted">
            When
          </legend>
          <label className="flex items-center gap-2 text-body text-text">
            <input
              type="radio"
              name={`${fieldId}-when`}
              checked={when === 'now'}
              onChange={() => setWhen('now')}
            />
            Now <span className="text-text-muted">(30 seconds to undo)</span>
          </label>
          <label className="flex items-center gap-2 text-body text-text">
            <input
              type="radio"
              name={`${fieldId}-when`}
              checked={when === 'later'}
              onChange={() => {
                setWhen('later')
                if (!laterValue) {
                  setLaterValue(toLocalInput(Date.now() + 60 * MINUTE_MS))
                }
              }}
            />
            Later
          </label>
          {when === 'later' ? (
            <div className="pl-6">
              <label htmlFor={`${fieldId}-at`} className="sr-only">
                Send at
              </label>
              <input
                id={`${fieldId}-at`}
                type="datetime-local"
                value={laterValue}
                onChange={(event) => setLaterValue(event.target.value)}
                className="h-9 rounded-control border border-control bg-transparent px-2 font-mono text-label text-text"
              />
              <p className="mt-1 font-mono text-meta text-text-muted">
                {laterProblem ??
                  `Your time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`}
              </p>
            </div>
          ) : null}
        </fieldset>

        <div>
          <label
            htmlFor={`${fieldId}-copy`}
            className="mb-1.5 block font-mono text-label text-text-muted"
          >
            Send a copy to
          </label>
          <select
            id={`${fieldId}-copy`}
            value={copy}
            onChange={(event) => setCopy(event.target.value as EmailCopyChoice)}
            className="h-9 w-full rounded-control border border-control bg-transparent px-2 font-mono text-label text-text"
          >
            <option value="archive">{copyAddresses.archive}</option>
            {copyAddresses.me !== copyAddresses.archive ? (
              <option value="me">{copyAddresses.me} (you)</option>
            ) : null}
            <option value="none">No copy</option>
          </select>
        </div>

        {blockedReason ? (
          <p className="text-body text-text">{blockedReason}</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-body text-danger">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
          <Button
            type="button"
            variant="primary"
            disabled={!canSend}
            onClick={() => void confirm()}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
