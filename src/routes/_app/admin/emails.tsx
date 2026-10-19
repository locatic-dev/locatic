import { createFileRoute, redirect } from '@tanstack/react-router'

import {
  FormRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '@/components/app-shell/route-pending'
import { CampaignWorkspace } from '@/features/email-campaigns/components/campaign-workspace'
import { emailCampaignListQueryOptions } from '@/features/email-campaigns/queries'
import { viewerQueryOptions } from '@/features/viewer/queries'
import { shouldPrefetchPrivateConvexQueries } from '@/lib/auth-routing'
import { seo } from '@/lib/seo'

export const Route = createFileRoute('/_app/admin/emails')({
  // `_app` has already loaded the viewer bootstrap (after the Convex token is
  // set, on SSR and client navigation); this reads the cached result before
  // any privileged query runs. Every Convex function checks again.
  beforeLoad: async ({ context }) => {
    const bootstrap =
      await context.queryClient.ensureQueryData(viewerQueryOptions())
    if (!bootstrap.isEmailAdmin) {
      throw redirect({ to: '/home' })
    }
  },
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
