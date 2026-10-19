export interface EmailConfig {
  from: string
  replyTo: string
  siteUrl: string
  postalAddress: string | null
}

const DEFAULT_SITE_URL = 'https://locatic.dev'

function configuredSiteUrl() {
  return process.env.SITE_URL?.trim().replace(/\/+$/, '') || null
}

/** Base for links in email (footer, projects); production when unset. */
export function getSiteUrl() {
  return configuredSiteUrl() ?? DEFAULT_SITE_URL
}

export function getEmailConfig(): EmailConfig | null {
  const from = process.env.EMAIL_FROM?.trim()
  const replyTo = process.env.EMAIL_REPLY_TO?.trim()
  const siteUrl = configuredSiteUrl()
  if (!from || !replyTo || !siteUrl) return null
  return {
    from,
    replyTo,
    siteUrl,
    postalAddress: process.env.EMAIL_POSTAL_ADDRESS?.trim() || null,
  }
}

export function isCampaignSendingEnabled() {
  return process.env.EMAIL_SENDING_ENABLED === 'true'
}

export function isTestSendingEnabled() {
  return process.env.EMAIL_TEST_SENDING_ENABLED === 'true'
}

// The component's test mode only restricts recipients to Resend's test
// addresses; it is not a mock. Leave it on unless a sending switch is on.
export function isLiveDelivery() {
  return isCampaignSendingEnabled() || isTestSendingEnabled()
}

/** EMAIL_TEST_RECIPIENTS: comma-separated, compared case-insensitively. */
export function getTestRecipients() {
  return (process.env.EMAIL_TEST_RECIPIENTS ?? '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean)
}

export function isTestRecipient(address: string) {
  const normalized = address.trim().toLowerCase()
  return getTestRecipients().some(
    (allowed) => allowed.toLowerCase() === normalized,
  )
}

const DEFAULT_COPY_ADDRESS = 'contact@locatic.dev'

/** Where "Send a copy to" goes by default: EMAIL_COPY_ADDRESS. */
export function getCopyAddress() {
  return process.env.EMAIL_COPY_ADDRESS?.trim() || DEFAULT_COPY_ADDRESS
}
