import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { MemberShell } from '@/components/app-shell/member-shell'
import type { ViewerBootstrapPayload } from '@/features/contracts'
import { viewerQueryOptions } from '@/features/viewer/queries'
import { isProjectDetailPath } from '@/lib/auth-routing'
import { toSafeRelativeUrl } from '@/lib/safe-redirect'

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      if (isProjectDetailPath(location.pathname)) {
        return
      }

      // `location.href` is pathname + search + hash. SSR requests carry no
      // hash, so only client-side navigations preserve it.
      throw redirect({
        to: '/sign-in/$',
        search: { redirect: toSafeRelativeUrl(location.href) ?? undefined },
      })
    }

    const bootstrap = (await context.queryClient.ensureQueryData(
      viewerQueryOptions(),
    )) as ViewerBootstrapPayload

    if (bootstrap.needsOnboarding && !isProjectDetailPath(location.pathname)) {
      // `/home` is the signed-in default, not a destination the user asked
      // for; dropping it lets onboarding fall back to Explore for new users.
      throw redirect({
        to: '/onboarding',
        search: {
          redirect:
            location.pathname === '/home'
              ? undefined
              : (toSafeRelativeUrl(location.href) ?? undefined),
        },
      })
    }
  },
  component: AuthenticatedApp,
})

/**
 * Unauthenticated viewers only reach here on public project-detail browsing
 * (other `_app` routes redirect to sign-in in `beforeLoad`); they get a bare
 * Outlet with no shell.
 */
function AuthenticatedApp() {
  return (
    <MemberShell withoutViewer={<Outlet />}>
      <Outlet />
    </MemberShell>
  )
}
