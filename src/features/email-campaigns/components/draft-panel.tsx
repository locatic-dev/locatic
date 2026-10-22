import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Id } from '../../../../convex/_generated/dataModel'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { reportActionError } from '@/lib/action-error'
import { useUnsavedChangesGuard } from '@/features/settings/use-unsaved-changes-guard'
import {
  audienceSkipReasons,
  type CampaignDraft,
  type EmailCampaignDetail,
} from '../contracts'
import { useRequestEmailSend, useUnscheduleEmailSend } from '../mutations'
import { useCampaignPreview } from '../use-campaign-preview'
import { type AutosaveStatus, useDraftAutosave } from '../use-draft-autosave'
import { CampaignEditor } from './campaign-editor'
import { PreviewPane } from './preview-pane'
import { SendDialog } from './send-dialog'
import { TestSendPanel } from './test-send-panel'

function formatClock(timestamp: number) {
  return new Intl.DateTimeFormat('en', { timeStyle: 'short' }).format(timestamp)
}

function SaveStatus({
  status,
  hasStoredDraft,
  onRetry,
}: {
  status: AutosaveStatus
  hasStoredDraft: boolean
  onRetry: () => void
}) {
  const text =
    status.kind === 'saving'
      ? 'Saving…'
      : status.kind === 'saved'
        ? `Saved ${formatClock(status.at)}`
        : status.kind === 'error'
          ? "Couldn't save"
          : hasStoredDraft
            ? 'Saved'
            : 'Saves as you type'
  return (
    <p
      role="status"
      className="flex items-center gap-2 font-mono text-meta text-text-muted"
    >
      {text}
      {status.kind === 'error' ? (
        <Button
          type="button"
          size="sm"
          className="pointer-coarse:h-11"
          onClick={onRetry}
        >
          Retry
        </Button>
      ) : null}
    </p>
  )
}

export interface DraftPanelProps {
  /** The stored campaign once it has loaded; null for New until then. */
  detail: EmailCampaignDetail | null
  /** Where New starts; ignored when `detail` is given. */
  initialDraft: CampaignDraft
  /** New's first autosave created the campaign. */
  onCreated?: (campaignId: Id<'email_campaigns'>) => void
}

/** Write, Test and Send for one draft, autosaved as it is written. */
export function DraftPanel({
  detail,
  initialDraft,
  onCreated,
}: DraftPanelProps) {
  const navigate = useNavigate()
  const requestSend = useRequestEmailSend()
  const unscheduleSend = useUnscheduleEmailSend()
  // Lets the navigation after create or discard past the unsaved guard.
  const allowNextNavigation = useRef(false)
  const autosave = useDraftAutosave({
    detail,
    initialDraft,
    onCreated: (campaignId) => {
      allowNextNavigation.current = true
      onCreated?.(campaignId)
    },
  })
  const { draft, saved, status, isDirty } = autosave
  const preview = useCampaignPreview({
    subject: draft.subject,
    preheader: draft.preheader,
    content: draft.content,
  })
  const stored = detail !== null || saved.campaignId !== null
  const [discarding, setDiscarding] = useState(false)
  // A Discard that finishes after the admin left must not pull them back.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useUnsavedChangesGuard(isDirty, allowNextNavigation)

  const discard = async () => {
    if (
      (stored || isDirty) &&
      !window.confirm(
        `Discard "${draft.title || 'this draft'}"? This can't be undone.`,
      )
    ) {
      return
    }
    setDiscarding(true)
    const discarded = await autosave.discard()
    if (!mounted.current) return
    setDiscarding(false)
    if (!discarded) return
    if (stored) toast.success('Draft discarded.')
    allowNextNavigation.current = true
    await navigate({ to: '/admin/emails', replace: true })
  }

  const blockedReason = !detail?.sendingEnabled
    ? 'Sending is off in this environment.'
    : isDirty || status.kind === 'saving'
      ? 'Wait for your changes to save.'
      : null

  return (
    <Tabs defaultValue="write" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line">
        <TabsList aria-label="Draft steps">
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="test" disabled={!detail}>
            Test
          </TabsTrigger>
          <TabsTrigger value="send" disabled={!detail}>
            Send
          </TabsTrigger>
        </TabsList>
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <SaveStatus
            status={status}
            hasStoredDraft={stored}
            onRetry={() => void autosave.saveNow()}
          />
          <Button
            type="button"
            size="sm"
            className="pointer-coarse:h-11"
            disabled={discarding}
            onClick={() => void discard()}
          >
            {discarding ? 'Discarding…' : 'Discard draft'}
          </Button>
        </div>
      </div>

      {detail && detail.preparationDiagnostics.length > 0 ? (
        <div
          role="alert"
          className="rounded-control border border-danger px-3 py-2 text-body text-text"
        >
          {detail.preparationDiagnostics.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}

      <TabsContent value="write">
        {/* Side by side from lg; on smaller screens Edit and Preview are tabs. */}
        <Tabs defaultValue="edit" className="space-y-4">
          <TabsList aria-label="Write view" className="lg:hidden">
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
          <div className="grid gap-6 lg:grid-cols-2">
            <TabsContent
              value="edit"
              forceMount
              className="min-w-0 data-[state=inactive]:hidden lg:data-[state=inactive]:block"
            >
              <CampaignEditor
                draft={draft}
                onChange={autosave.setDraft}
                onSaveNow={() => void autosave.saveNow()}
                onReload={autosave.reload}
                isStale={autosave.isStale}
                skipReasons={audienceSkipReasons(detail)}
              />
            </TabsContent>
            <TabsContent
              value="preview"
              forceMount
              className="min-w-0 data-[state=inactive]:hidden lg:data-[state=inactive]:block"
            >
              <PreviewPane {...preview} />
            </TabsContent>
          </div>
        </Tabs>
      </TabsContent>

      {detail ? (
        <>
          <TabsContent value="test">
            <TestSendPanel detail={detail} draft={draft} />
          </TabsContent>

          <TabsContent value="send" className="max-w-lg space-y-4">
            <p className="text-body text-text-muted">
              {draft.audience.kind === 'members'
                ? 'Sends the saved version to the members in To, unless their settings say otherwise.'
                : `Sends the saved version to every member who gets ${
                    draft.content.kind === 'digest'
                      ? 'the digest'
                      : 'Locatic updates'
                  } and has a verified email.`}{' '}
              You'll see who it goes to first, and can undo for 30 seconds.
            </p>
            {detail.sender ? (
              <p className="font-mono text-meta text-text-muted">
                From {detail.sender}
                {detail.replyTo ? ` · replies to ${detail.replyTo}` : ''}
              </p>
            ) : null}
            <SendDialog
              campaignId={detail.id}
              subject={draft.subject}
              kind={draft.content.kind}
              copyAddresses={detail.copyAddresses}
              blockedReason={blockedReason}
              onSend={async ({ copy, sendAt }) => {
                const result = await requestSend({
                  campaignId: detail.id,
                  expectedRevision: saved.revision,
                  copy,
                  ...(sendAt === undefined ? {} : { sendAt }),
                })
                // Scheduling takes the next revision; Undo names it.
                const scheduledRevision = saved.revision + 1
                toast.success(
                  sendAt === undefined
                    ? 'Sending in 30 seconds.'
                    : `Scheduled for ${new Intl.DateTimeFormat('en', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(result.sendAt)}.`,
                  {
                    action: {
                      label: 'Undo',
                      onClick: () => {
                        unscheduleSend({
                          campaignId: detail.id,
                          expectedRevision: scheduledRevision,
                        }).then(
                          () => toast.success('Send undone.'),
                          (error: unknown) =>
                            reportActionError(error, {
                              title: "couldn't undo",
                            }),
                        )
                      },
                    },
                  },
                )
              }}
            />
          </TabsContent>
        </>
      ) : null}
    </Tabs>
  )
}
