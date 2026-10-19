import { createFileRoute } from '@tanstack/react-router'

import { CampaignPage } from '@/features/email-campaigns/components/campaign-page'
import { emailCampaignQueryOptions } from '@/features/email-campaigns/queries'
import {
  NEW_CAMPAIGN_ID,
  type NewCampaignKind,
  parseNewCampaignKind,
} from '@/features/email-campaigns/route-search'
import { shouldPrefetchPrivateConvexQueries } from '@/lib/auth-routing'

// `/admin/emails/new?kind=update|digest` is an unsaved draft: nothing is
// stored until it has content. Every other id is a campaign.
export const Route = createFileRoute('/_app/admin/emails/$campaignId')({
  // Optional, so links to a campaign need no search params.
  validateSearch: (
    search: Record<string, unknown>,
  ): { kind?: NewCampaignKind } =>
    search.kind === undefined
      ? {}
      : { kind: parseNewCampaignKind(search.kind) },
  loader: async ({ context, params }) => {
    // Client navigations fetch in the page, once Convex auth is ready.
    if (
      params.campaignId === NEW_CAMPAIGN_ID ||
      !shouldPrefetchPrivateConvexQueries()
    ) {
      return
    }
    await context.queryClient.ensureQueryData(
      emailCampaignQueryOptions(params.campaignId),
    )
  },
  component: CampaignRoute,
})

function CampaignRoute() {
  const { campaignId } = Route.useParams()
  const { kind } = Route.useSearch()
  return <CampaignPage campaignId={campaignId} kind={kind ?? 'update'} />
}
