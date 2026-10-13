import { createFileRoute } from '@tanstack/react-router'

import { CampaignWorkspace } from '@/features/email-campaigns/components/campaign-workspace'
import { emailCampaignListQueryOptions } from '@/features/email-campaigns/queries'
import {
  FormRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '@/components/app-shell/route-pending'
import { shouldPrefetchPrivateConvexQueries } from '@/lib/auth-routing'
import { seo } from '@/lib/seo'

export const Route = createFileRoute('/_app/admin/emails')({
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
  head: () => seo({ title: 'emails', noindex: true }),
  component: CampaignWorkspace,
})
