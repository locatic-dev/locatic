import type { FunctionArgs, FunctionReturnType } from 'convex/server'

import type { api } from '../../../convex/_generated/api'

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
export type EmailProjectSelection = FunctionReturnType<
  typeof api.emailCampaigns.searchProjects
>[number]
export type EmailPreviewArgs = Omit<
  FunctionArgs<typeof api.emailRender.previewCampaign>,
  'requestId'
>

/** What the editor holds: the saved fields plus local edits. */
export interface CampaignDraft {
  title: string
  subject: string
  preheader: string
  content: EmailCampaignContent
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
} as const

/** Sends start being "stalled" (Resume offered) after this long. */
export const STALLED_AFTER_MS = 5 * 60_000

export const CAMPAIGN_STATE_LABELS: Record<EmailCampaignState, string> = {
  draft: 'draft',
  sending: 'sending',
  sent: 'sent',
  cancelled: 'cancelled',
}

export const SEND_STATUS_LABELS: Record<EmailSendStatus, string> = {
  queued: 'waiting to send',
  sent: 'sent',
  delivered: 'delivered',
  bounced: 'bounced',
  complained: 'marked as spam',
  failed: 'failed',
  cancelled: 'cancelled',
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

export function detailToDraft(detail: EmailCampaignDetail): CampaignDraft {
  return {
    title: detail.title,
    subject: detail.subject,
    preheader: detail.preheader,
    content: detail.content,
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

/** "sent to N · M delivered" for a campaign that started sending. */
export function resultsSummary(results: {
  total: number
  delivered: number
  capped: boolean
}) {
  const suffix = results.capped ? '+' : ''
  return `sent to ${formatCount(results.total)}${suffix} · ${formatCount(
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
