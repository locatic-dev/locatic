import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useConvexAuth } from 'convex/react'
import { AppLayout } from '@/components/app-shell/app-layout'
import { ContentRoutePending } from '@/components/app-shell/route-pending'
import {
  mapViewerBootstrap,
  type ViewerBootstrapPayload,
} from '@/features/contracts'
import { notificationsUnreadCountQueryOptions } from '@/features/notifications/queries'
import { viewerQueryOptions } from '@/features/viewer/queries'
import { isProjectDetailPath } from '@/lib/auth-routing'
import { ConvexAuthReadyBoundary } from '@/integrations/convex/provider'

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      if (isProjectDetailPath(location.pathname)) {
        return
      }

      throw redirect({ to: '/sign-in/$' })
    }

    const bootstrap = (await context.queryClient.ensureQueryData(
      viewerQueryOptions(),
    )) as ViewerBootstrapPayload

    if (bootstrap.needsOnboarding && !isProjectDetailPath(location.pathname)) {
      throw redirect({ to: '/onboarding' })
    }
  },
  component: AuthenticatedApp,
})

function AuthenticatedApp() {
  return <ShellApp />
}

/**
 * Renders the persistent app shell frame (sidebar, main region, mobile nav)
 * immediately from the SSR'd viewer bootstrap, already `ensureQueryData`'d in `beforeLoad`,
 * so `useSuspenseQuery` resolves on first paint with no flash. Only the content
 * region (`<Outlet/>`) waits on the Convex auth handshake, behind a
 * content-scoped pending state. The frame never blocks on Convex readiness.
 *
 * Unauthenticated viewers only reach here on public project-detail browsing
 * (other `_app` routes redirect to sign-in in `beforeLoad`); they get a bare
 * Outlet with no shell.
 */
function ShellApp() {
  const { data } = useSuspenseQuery(viewerQueryOptions())
  const bootstrap = mapViewerBootstrap(
    data as ViewerBootstrapPayload | undefined,
  )
  const viewer = bootstrap?.viewer
  const hasViewer = Boolean(viewer)
  const convexAuth = useConvexAuth()
  // Unread counts are client-only live queries (not SSR'd). Gate them on the
  // Convex auth handshake so they never fire unauthenticated when the shell
  // paints ahead of Convex readiness; badges simply appear once auth is ready.
  const { data: unreadNotificationsData } = useQuery({
    ...notificationsUnreadCountQueryOptions(),
    enabled: hasViewer && convexAuth.isAuthenticated,
    staleTime: 30_000,
  })

  if (!viewer) {
    return <Outlet />
  }

  const viewerForShell = {
    displayName: viewer.displayName,
    githubUsername: viewer.githubUsername,
    avatarUrl: viewer.avatarUrl,
    city: viewer.cityName ?? undefined,
  }

  return (
    <AppLayout
      viewer={viewerForShell}
      unreadNotifications={
        typeof unreadNotificationsData === 'number'
          ? unreadNotificationsData
          : 0
      }
      unreadMessages={viewer.unreadMessagesCount ?? 0}
    >
      <ConvexAuthReadyBoundary
        fallback={<ContentRoutePending />}
        requireAuthenticated
      >
        <Outlet />
      </ConvexAuthReadyBoundary>
    </AppLayout>
  )
}
