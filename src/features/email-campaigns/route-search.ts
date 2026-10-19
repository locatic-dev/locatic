import type { EmailSendStatus } from './contracts'

// URL search params for the admin email routes. Route files are in the entry
// bundle, so this module stays tiny and imports only types.

/** The `$campaignId` of an unsaved New draft. */
export const NEW_CAMPAIGN_ID = 'new'

/** The `?kind=` of the New page: "update" or "digest". */
export type NewCampaignKind = 'update' | 'digest'

export function parseNewCampaignKind(value: unknown): NewCampaignKind {
  return value === 'digest' ? 'digest' : 'update'
}

// A Record so a new status fails to compile until it is listed here.
const SEND_STATUSES: Record<EmailSendStatus, true> = {
  queued: true,
  sent: true,
  delivered: true,
  bounced: true,
  complained: true,
  failed: true,
  cancelled: true,
}

/** The log's `?status=` filter; anything unknown means all statuses. */
export function parseSendStatus(value: unknown): EmailSendStatus | undefined {
  return typeof value === 'string' && Object.hasOwn(SEND_STATUSES, value)
    ? (value as EmailSendStatus)
    : undefined
}
