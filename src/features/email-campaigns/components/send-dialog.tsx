import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
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
  formatCount,
  skippedSummary,
} from '../contracts'
import { emailSendPreviewQueryOptions } from '../queries'

export interface SendDialogProps {
  campaignId: Id<'email_campaigns'>
  subject: string
  kind: EmailCampaignKind
  /** Why sending is not possible right now (unsaved edits, sending off). */
  blockedReason: string | null
  onSend: () => Promise<void>
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
  blockedReason,
  onSend,
}: SendDialogProps) {
  const [open, setOpen] = useState(false)
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
    !sending &&
    !!preview &&
    (preview.capped || preview.estimatedCount > 0)
  const confirmLabel = sending
    ? 'Sending…'
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
      await onSend()
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
