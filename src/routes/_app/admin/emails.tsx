import { createFileRoute, redirect } from '@tanstack/react-router'

import { EmailAdminLayout } from '@/features/email-campaigns/components/email-admin-layout'
import { viewerQueryOptions } from '@/features/viewer/queries'
import { seo } from '@/lib/seo'

export const Route = createFileRoute('/_app/admin/emails')({
  // `_app` has already loaded the viewer bootstrap (after the Convex token is
  // set, on SSR and client navigation); this reads the cached result before
  // any privileged query runs, for every page below. Every Convex function
  // checks again.
  beforeLoad: async ({ context }) => {
    const bootstrap =
      await context.queryClient.ensureQueryData(viewerQueryOptions())
    if (!bootstrap.isEmailAdmin) {
      throw redirect({ to: '/home' })
    }
  },
  head: () => seo({ title: 'emails', noindex: true }),
  component: EmailAdminLayout,
})
