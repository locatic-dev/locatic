import { Link, Outlet, useRouterState } from '@tanstack/react-router'

import { PageHeader } from '@/components/app-shell/page-header'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { NEW_CAMPAIGN_ID } from '../route-search'

function navLinkClassName(active: boolean) {
  return cn(
    'inline-flex min-h-11 items-center border-b-2 px-3.5 font-mono text-label transition-colors hover:text-text',
    active
      ? 'border-selected-bar text-text'
      : 'border-transparent text-text-muted',
  )
}

/** The admin email pages: header, New actions, and Campaigns / Sent log. */
export function EmailAdminLayout() {
  const onLog = useRouterState({
    select: (state) => /\/admin\/emails\/log\/?$/.test(state.location.pathname),
  })
  return (
    <div className="lx-page-shell">
      <PageHeader
        title="email campaigns"
        subtitle="admin"
        width="wide"
        actions={
          <>
            <Button asChild size="touch">
              <Link
                to="/admin/emails/$campaignId"
                params={{ campaignId: NEW_CAMPAIGN_ID }}
                search={{ kind: 'digest' }}
              >
                New digest
              </Link>
            </Button>
            <Button asChild size="touch" variant="primary">
              <Link
                to="/admin/emails/$campaignId"
                params={{ campaignId: NEW_CAMPAIGN_ID }}
                search={{ kind: 'update' }}
              >
                New update
              </Link>
            </Button>
          </>
        }
      />
      <div className="lx-page-scroll">
        <div className="lx-page-width-wide space-y-5">
          <nav aria-label="Email admin" className="flex border-b border-line">
            {/* Campaigns is highlighted on the list, /new and each campaign;
                the router marks aria-current only on the exact list. */}
            <Link
              to="/admin/emails"
              activeOptions={{ exact: true }}
              className={navLinkClassName(!onLog)}
            >
              campaigns
            </Link>
            <Link to="/admin/emails/log" className={navLinkClassName(onLog)}>
              sent log
            </Link>
          </nav>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
