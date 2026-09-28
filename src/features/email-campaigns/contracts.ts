import type { FunctionReturnType } from 'convex/server'

import type { emailClientRefs } from '@/integrations/convex/email-function-refs'

export type EmailCampaignSummary = FunctionReturnType<
  typeof emailClientRefs.campaigns.list
>[number]
export type EmailCampaignDetail = NonNullable<
  FunctionReturnType<typeof emailClientRefs.campaigns.get>
>
export type EmailCampaignContent = EmailCampaignDetail['content']
export type EmailProjectSelection = EmailCampaignContent['projects'][number]

export function campaignStatusLabel(status: string) {
  return status.replaceAll('_', ' ')
}

export function campaignPeriodLabel(
  campaign: Pick<EmailCampaignSummary, 'periodStart' | 'periodEnd'>,
) {
  if (campaign.periodStart === null || campaign.periodEnd === null) {
    return 'one-off'
  }
  const format = (value: number) =>
    new Intl.DateTimeFormat('en', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
      year: 'numeric',
    }).format(value)
  return `${format(campaign.periodStart)} to ${format(campaign.periodEnd)}`
}
