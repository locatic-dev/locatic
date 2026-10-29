import { useEffect } from 'react'
import { useAuth } from '@clerk/tanstack-react-start'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ContentRoutePending } from '@/components/app-shell/route-pending'
import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
  useRouter,
} from '@tanstack/react-router'
import { MemberShell } from '@/components/app-shell/member-shell'
import type { ViewerBootstrapPayload } from '@/features/contracts'
import { viewerQueryOptions } from '@/features/viewer/queries'
import { getAccountRecoveryState } from '@/features/viewer/lifecycle'
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

    if (getAccountRecoveryState(bootstrap)) {
      throw redirect({
        to: '/sign-in/$',
        search: { redirect: toSafeRelativeUrl(location.href) ?? undefined },
      })
    }

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

/** Public project browsing is the only visitor outlet in this route group. */
function AuthenticatedApp() {
  const { isLoaded, isSignedIn } = useAuth()
  const { data: bootstrap } = useSuspenseQuery(viewerQueryOptions())
  const location = useRouterState({ select: (state) => state.location })
  const isPublicProject = isProjectDetailPath(location.pathname)

  const router = useRouter()
  const needsRecovery =
    isSignedIn && Boolean(getAccountRecoveryState(bootstrap))
  const needsSignIn =
    isLoaded && ((!isPublicProject && !isSignedIn) || needsRecovery)

  // A mounted route must also react to session loss. Depend on stable values:
  // a newly-created <Navigate> prop object can restart an in-flight redirect.
  useEffect(() => {
    if (!needsSignIn) return
    void router.navigate({
      to: '/sign-in/$',
      search: { redirect: toSafeRelativeUrl(location.href) ?? undefined },
      replace: true,
    })
  }, [location.href, needsSignIn, router])

  if (needsSignIn) return <ContentRoutePending />

  return (
    <MemberShell
      withoutViewer={isPublicProject ? <Outlet /> : <ContentRoutePending />}
    >
      <Outlet />
    </MemberShell>
  )
}
