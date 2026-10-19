import type { Id } from '../../../../convex/_generated/dataModel'
import type { CampaignDraft, EmailCampaignDetail } from '../contracts'

export const CAMPAIGN_ID = 'campaign_1' as Id<'email_campaigns'>

export const announcementDraft: CampaignDraft = {
  title: 'Maps launch',
  subject: 'Maps',
  preheader: '',
  content: { kind: 'announcement', body: 'Hello', cta: null },
  audience: { kind: 'everyone' },
}

export function makeDetail(
  overrides: Partial<EmailCampaignDetail> = {},
): EmailCampaignDetail {
  return {
    id: CAMPAIGN_ID,
    ...announcementDraft,
    revision: 2,
    templateVersion: 2,
    state: 'draft',
    preparationDiagnostics: [],
    sender: 'Locatic <updates@locatic.test>',
    replyTo: 'hello@locatic.test',
    sendingEnabled: true,
    testSendingEnabled: true,
    testRecipients: ['admin@example.test'],
    defaultTestRecipient: 'admin@example.test',
    copyAddresses: { archive: 'contact@locatic.dev', me: 'admin@example.test' },
    scheduled: null,
    updatedAt: 0,
    sending: null,
    results: null,
    ...overrides,
  }
}
