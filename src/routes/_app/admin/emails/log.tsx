import { createFileRoute } from '@tanstack/react-router'

import { SendLog } from '@/features/email-campaigns/components/send-log'
import type { EmailSendStatus } from '@/features/email-campaigns/contracts'
import { parseSendStatus } from '@/features/email-campaigns/route-search'

// The status filter lives in the URL, so a filtered log can be shared.
export const Route = createFileRoute('/_app/admin/emails/log')({
  // Optional, so links to the log need no search params.
  validateSearch: (
    search: Record<string, unknown>,
  ): { status?: EmailSendStatus } => ({
    status: parseSendStatus(search.status),
  }),
  component: SendLogRoute,
})

function SendLogRoute() {
  const { status } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <SendLog
      status={status}
      onStatusChange={(next) =>
        void navigate({ search: { status: next }, replace: true })
      }
    />
  )
}
