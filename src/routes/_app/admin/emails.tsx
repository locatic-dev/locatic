import { createFileRoute } from '@tanstack/react-router'

import { CampaignWorkspace } from '@/features/email-campaigns/components/campaign-workspace'
import { emailCampaignListQueryOptions } from '@/features/email-campaigns/queries'
import {
  FormRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '@/components/app-shell/route-pending'

export const Route = createFileRoute('/_app/admin/emails')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(emailCampaignListQueryOptions()),
  pendingComponent: FormRoutePending,
  pendingMs: ROUTE_PENDING_MS,
  pendingMinMs: ROUTE_PENDING_MIN_MS,
  component: CampaignWorkspace,
})
