import { createFileRoute } from '@tanstack/react-router'

import {
  FormRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '@/components/app-shell/route-pending'
import { CampaignIndex } from '@/features/email-campaigns/components/campaign-list'
import { emailCampaignListQueryOptions } from '@/features/email-campaigns/queries'
import { shouldPrefetchPrivateConvexQueries } from '@/lib/auth-routing'

export const Route = createFileRoute('/_app/admin/emails/')({
  loader: async ({ context }) => {
    // Client navigations fetch in the page, once Convex auth is ready.
    if (!shouldPrefetchPrivateConvexQueries()) {
      return
    }
    await context.queryClient.ensureQueryData(emailCampaignListQueryOptions())
  },
  pendingComponent: FormRoutePending,
  pendingMs: ROUTE_PENDING_MS,
  pendingMinMs: ROUTE_PENDING_MIN_MS,
  component: CampaignIndex,
})
