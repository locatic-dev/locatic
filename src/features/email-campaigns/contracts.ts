import type { FunctionArgs, FunctionReturnType } from 'convex/server'

import type { api } from '../../../convex/_generated/api'
import type { NewCampaignKind } from './route-search'

export type EmailCampaignSummary = FunctionReturnType<
  typeof api.emailCampaigns.list
>[number]
export type EmailCampaignDetail = NonNullable<
  FunctionReturnType<typeof api.emailCampaigns.get>
>
export type EmailCampaignContent = EmailCampaignDetail['content']
export type EmailCampaignKind = EmailCampaignContent['kind']
export type EmailCampaignState = EmailCampaignDetail['state']
export type EmailCampaignResults = NonNullable<EmailCampaignDetail['results']>
export type EmailSendStatus = keyof EmailCampaignResults['counts']
export type EmailSendPreview = FunctionReturnType<
  typeof api.emailCampaigns.getSendPreview
>
export type EmailRecipient = FunctionReturnType<
  typeof api.emailCampaigns.listRecipients
>['page'][number]
export type EmailAudienceMember = FunctionReturnType<
  typeof api.emailCampaigns.searchMembers
>[number]
export type EmailCopyAddresses = EmailCampaignDetail['copyAddresses']
export type EmailCopyChoice = FunctionArgs<
  typeof api.emailRender.requestSend
>['copy']
export type EmailSendLogEntry = FunctionReturnType<
  typeof api.emailCampaigns.listSendLog
>['page'][number]
export type EmailProjectSelection = FunctionReturnType<
  typeof api.emailCampaigns.searchProjects
>[number]
export type EmailPreviewArgs = Omit<
  FunctionArgs<typeof api.emailRender.previewCampaign>,
  'requestId'
>

/** Who a draft goes to; named members keep what their chips show. */
export type DraftAudience =
  | { kind: 'everyone' }
  | { kind: 'members'; members: EmailAudienceMember[] }

/** What the editor holds: the saved fields plus local edits. */
export interface CampaignDraft {
  title: string
  subject: string
  preheader: string
  content: EmailCampaignContent
  audience: DraftAudience
}

/** The draft as `createDraft` and `saveDraft` take it. */
export function draftToArgs(draft: CampaignDraft) {
  return {
    title: titleForSave(draft),
    subject: draft.subject,
    preheader: draft.preheader,
    content: draft.content,
    audience:
      draft.audience.kind === 'everyone'
        ? { kind: 'everyone' as const }
        : {
            kind: 'members' as const,
            userIds: draft.audience.members.map((member) => member.userId),
          },
  }
}

/**
 * Whether a new draft has anything worth storing yet. Until it does,
 * autosave writes nothing, so opening New and leaving creates no campaign.
 */
export function hasDraftContent(draft: CampaignDraft) {
  const { content } = draft
  return (
    [draft.title, draft.subject, draft.preheader, content.body].some(
      (value) => value.trim() !== '',
    ) ||
    content.cta !== null ||
    draft.audience.kind === 'members' ||
    (content.kind === 'digest' &&
      (content.projects.length > 0 || content.discussions.length > 0))
  )
}

// Mirrors LIMITS in convex/lib/email_campaigns.ts; a test keeps them equal.
export const EMAIL_LIMITS = {
  title: 160,
  subject: 140,
  preheader: 200,
  body: 20_000,
  ctaLabel: 40,
  url: 2_000,
  projects: 5,
  discussions: 2,
  sendPreviewMembers: 100,
  audienceMembers: 50,
} as const

/** Send waits this long so it can be undone (SEND_DELAY_MS on the server). */
export const SEND_DELAY_MS = 30_000

/** Sends start being "stalled" (Resume offered) after this long. */
export const STALLED_AFTER_MS = 5 * 60_000

export const CAMPAIGN_STATE_LABELS: Record<EmailCampaignState, string> = {
  draft: 'draft',
  scheduled: 'scheduled',
  sending: 'sending',
  sent: 'sent',
  cancelled: 'cancelled',
}

export const SEND_STATUS_LABELS: Record<EmailSendStatus, string> = {
  queued: 'waiting to send',
  sent: 'handed to Resend',
  delivered: 'delivered',
  bounced: 'bounced',
  complained: 'marked as spam',
  failed: 'failed',
  cancelled: 'cancelled',
}

/** What each status count means, shown under it in the results. */
export const SEND_STATUS_HINTS: Record<EmailSendStatus, string> = {
  queued: 'not handed to Resend yet',
  sent: 'handed to Resend; delivery not confirmed',
  delivered: "accepted by the reader's mail server",
  bounced: 'rejected by the mail server',
  complained: 'reported as spam by the reader',
  failed: 'could not be sent',
  cancelled: 'stopped before it went out',
}

/** A count from the server that may stop at a cap. */
export interface BoundedCount {
  count: number
  capped: boolean
}

/** "N", or "N+" when the server stopped counting. */
export function formatBoundedCount({ count, capped }: BoundedCount) {
  return `${formatCount(count)}${capped ? '+' : ''}`
}

export const SEND_STATUS_ORDER: EmailSendStatus[] = [
  'delivered',
  'sent',
  'queued',
  'bounced',
  'complained',
  'failed',
  'cancelled',
]

export function campaignKindLabel(kind: EmailCampaignKind) {
  return kind === 'digest' ? 'digest' : 'update'
}

/**
 * What the New page starts from. It lives only in the browser until the
 * first save; the digest period fields are placeholders the server replaces.
 */
export function emptyDraft(kind: NewCampaignKind): CampaignDraft {
  return {
    title: '',
    subject: '',
    preheader: '',
    content:
      kind === 'digest'
        ? {
            kind: 'digest',
            body: '',
            cta: null,
            periodKey: '',
            periodStart: 0,
            periodEnd: 0,
            projects: [],
            discussions: [],
          }
        : { kind: 'announcement', body: '', cta: null },
    audience: { kind: 'everyone' },
  }
}

/** The title to save: what was typed, else the subject, else "Untitled …". */
export function titleForSave(draft: CampaignDraft) {
  return (
    draft.title.trim() ||
    draft.subject.trim() ||
    `Untitled ${campaignKindLabel(draft.content.kind)}`
  )
}

export function detailToDraft(detail: EmailCampaignDetail): CampaignDraft {
  return {
    title: detail.title,
    subject: detail.subject,
    preheader: detail.preheader,
    content: detail.content,
    audience: detail.audience,
  }
}

export function sameDraft(left: CampaignDraft, right: CampaignDraft) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function formatCount(count: number) {
  return new Intl.NumberFormat('en').format(count)
}

/** "about 12", or "1,000+" when the estimate stopped counting. */
export function audienceLabel(preview: EmailSendPreview) {
  return preview.capped
    ? `${formatCount(preview.estimatedCount)}+`
    : formatCount(preview.estimatedCount)
}

export function peopleLabel(count: number) {
  return count === 1 ? '1 person' : `${formatCount(count)} people`
}

/** Skipped members in words, e.g. "2 turned updates off · 1 unverified email". */
export function skippedSummary(
  skipped: EmailSendPreview['skipped'],
  kind: EmailCampaignKind,
) {
  const parts: string[] = []
  if (skipped.unsubscribed > 0) {
    parts.push(
      kind === 'digest'
        ? `${formatCount(skipped.unsubscribed)} not signed up for the digest`
        : `${formatCount(skipped.unsubscribed)} turned updates off`,
    )
  }
  if (skipped.unverified > 0) {
    parts.push(
      `${formatCount(skipped.unverified)} unverified ${
        skipped.unverified === 1 ? 'email' : 'emails'
      }`,
    )
  }
  if (skipped.inactive > 0) {
    parts.push(
      `${formatCount(skipped.inactive)} inactive ${
        skipped.inactive === 1 ? 'account' : 'accounts'
      }`,
    )
  }
  return parts.join(' · ')
}

/** "N recipients · M delivered" for a campaign that started sending. */
export function resultsSummary(results: {
  total: BoundedCount
  delivered: BoundedCount
}) {
  const noun =
    results.total.count === 1 && !results.total.capped
      ? 'recipient'
      : 'recipients'
  return `${formatBoundedCount(results.total)} ${noun} · ${formatBoundedCount(
    results.delivered,
  )} delivered`
}

export function isStalled(
  detail: Pick<EmailCampaignDetail, 'state' | 'sending'>,
  now: number,
) {
  return (
    detail.state === 'sending' &&
    detail.sending !== null &&
    detail.sending.lastBatchAt < now - STALLED_AFTER_MS
  )
}

/** The server's stale-version message on save. */
export function isStaleDraftError(message: string) {
  return /campaign changed/i.test(message)
}
