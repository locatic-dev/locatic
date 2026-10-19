import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StatusPill } from '@/components/ui/status-pill'
import { reportActionError } from '@/lib/action-error'
import {
  CAMPAIGN_STATE_LABELS,
  campaignKindLabel,
  detailToDraft,
  emptyDraft,
} from '../contracts'
import { useCancelEmailSend, useResumeEmailSend } from '../mutations'
import { emailCampaignQueryOptions } from '../queries'
import { NEW_CAMPAIGN_ID, type NewCampaignKind } from '../route-search'
import { CampaignResults } from './campaign-results'
import { DraftPanel } from './draft-panel'
import { ScheduledPanel } from './scheduled-panel'

function BackToCampaigns() {
  return (
    <Link
      to="/admin/emails"
      className="inline-flex items-center gap-1.5 font-mono text-label text-text-muted hover:text-text"
    >
      <ArrowLeft aria-hidden className="size-3.5" />
      all campaigns
    </Link>
  )
}

function CampaignFrame({
  heading,
  meta,
  children,
}: {
  heading: string
  meta?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-4">
      <BackToCampaigns />
      <div>
        <h2 className="text-title text-text">{heading}</h2>
        {meta ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-meta text-text-muted">
            {meta}
          </div>
        ) : null}
      </div>
      <Card as="section" density="cozy" className="min-w-0">
        {children}
      </Card>
    </div>
  )
}

/**
 * One campaign: the draft editor, a scheduled send, or results once it
 * started sending. `new` is an unsaved draft of `kind`. When its first
 * autosave creates the campaign, the URL moves to the new id and the same
 * editor stays mounted (caret and in-flight typing kept).
 */
export function CampaignPage({
  campaignId,
  kind,
}: {
  campaignId: string
  kind: NewCampaignKind
}) {
  const navigate = useNavigate()
  const isNew = campaignId === NEW_CAMPAIGN_ID
  // The editor session: one New draft (per kind) or one campaign. Only the
  // move from New to the campaign that session created keeps it; opening
  // New again after arriving there (even of the same kind) starts afresh.
  const sessionKey = isNew ? `new:${kind}` : campaignId
  const [session, setSession] = useState({
    key: sessionKey,
    generation: 0,
    createdId: null as string | null,
    // The URL has reached `createdId`.
    arrived: false,
  })
  const keepsSession = isNew
    ? session.key === sessionKey && !session.arrived
    : session.key === sessionKey || session.createdId === campaignId
  if (!keepsSession) {
    setSession({
      key: sessionKey,
      generation: session.generation + 1,
      createdId: null,
      arrived: false,
    })
  } else if (!session.arrived && campaignId === session.createdId) {
    setSession({ ...session, arrived: true })
  }
  const composing = isNew || session.createdId === campaignId
  const query = useQuery(emailCampaignQueryOptions(isNew ? null : campaignId))
  const cancelSend = useCancelEmailSend()
  const resumeSend = useResumeEmailSend()
  const detail = query.data

  // While the created campaign loads, keep the editor; once loaded, a
  // missing campaign or an error shows as it would anywhere else.
  if (
    composing &&
    !query.error &&
    (detail === undefined || detail?.state === 'draft')
  ) {
    return (
      <CampaignFrame heading={detail?.title || `New ${kind}`}>
        <DraftPanel
          key={`${session.key}#${session.generation}`}
          detail={detail ?? null}
          initialDraft={emptyDraft(kind)}
          onCreated={(createdId) => {
            setSession((current) =>
              current.key === sessionKey ? { ...current, createdId } : current,
            )
            void navigate({
              to: '/admin/emails/$campaignId',
              params: { campaignId: createdId },
              replace: true,
            })
          }}
        />
      </CampaignFrame>
    )
  }

  if (query.error) {
    return (
      <CampaignFrame heading="Campaign">
        <div
          role="alert"
          className="flex flex-col items-center gap-3 py-10 text-center"
        >
          <p className="text-body text-text">Couldn't load this campaign.</p>
          <Button type="button" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      </CampaignFrame>
    )
  }
  if (detail === undefined) {
    return (
      <CampaignFrame heading="Campaign">
        <p className="py-10 text-center font-mono text-label text-text-muted">
          Loading…
        </p>
      </CampaignFrame>
    )
  }
  if (detail === null) {
    return (
      <CampaignFrame heading="Campaign not found">
        <p className="py-10 text-center text-body text-text-muted">
          This campaign doesn't exist or its draft was deleted.
        </p>
      </CampaignFrame>
    )
  }

  return (
    <CampaignFrame
      heading={detail.title}
      meta={
        <>
          <span>{campaignKindLabel(detail.content.kind)}</span>
          <StatusPill status={CAMPAIGN_STATE_LABELS[detail.state]} />
        </>
      }
    >
      {detail.state === 'draft' ? (
        <DraftPanel
          key={detail.id}
          detail={detail}
          initialDraft={detailToDraft(detail)}
        />
      ) : detail.state === 'scheduled' ? (
        <ScheduledPanel detail={detail} />
      ) : (
        <CampaignResults
          key={detail.id}
          detail={detail}
          onCancel={async () => {
            try {
              await cancelSend({ campaignId: detail.id })
              toast.success('Cancelling emails that have not gone out.')
            } catch (error) {
              reportActionError(error, { title: "couldn't cancel" })
            }
          }}
          onResume={async () => {
            try {
              await resumeSend({ campaignId: detail.id })
              toast.success('Sending resumed.')
            } catch (error) {
              reportActionError(error, { title: "couldn't resume" })
            }
          }}
        />
      )}
    </CampaignFrame>
  )
}
