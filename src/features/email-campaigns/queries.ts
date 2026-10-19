import { convexQuery } from '@convex-dev/react-query'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

export const emailCampaignListQueryOptions = () =>
  convexQuery(api.emailCampaigns.list, {})

export const emailCampaignQueryOptions = (
  campaignId: Id<'email_campaigns'> | null,
) => convexQuery(api.emailCampaigns.get, campaignId ? { campaignId } : 'skip')

/** Only while the send dialog is open: it reads up to 100 members. */
export const emailSendPreviewQueryOptions = (
  campaignId: Id<'email_campaigns'>,
  enabled: boolean,
) =>
  convexQuery(
    api.emailCampaigns.getSendPreview,
    enabled ? { campaignId } : 'skip',
  )

export const emailProjectSearchQueryOptions = (query: string) =>
  convexQuery(
    api.emailCampaigns.searchProjects,
    query.trim() ? { query } : 'skip',
  )
