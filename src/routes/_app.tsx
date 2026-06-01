import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from '@tanstack/react-router'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { AppLayout } from '@/components/app-shell/app-layout'
import { FormRoutePending } from '@/components/app-shell/route-pending'
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
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  })

  if (isProjectDetailPath(currentPath)) {
    return <ProjectDetailAuthGate />
  }

  return (
    <ConvexAuthReadyBoundary
      fallback={<FormRoutePending />}
      requireAuthenticated
    >
      <ShellApp />
    </ConvexAuthReadyBoundary>
  )
}

function ProjectDetailAuthGate() {
  const { data: viewerData } = useSuspenseQuery(viewerQueryOptions())
  const bootstrap = mapViewerBootstrap(
    viewerData as ViewerBootstrapPayload | undefined,
  )

  if (!bootstrap?.isAuthenticated) {
    return <Outlet />
  }

  return (
    <ConvexAuthReadyBoundary
      fallback={<FormRoutePending />}
      requireAuthenticated
    >
      <ShellApp />
    </ConvexAuthReadyBoundary>
  )
}

function ShellApp() {
  const { data } = useSuspenseQuery(viewerQueryOptions())
  const bootstrap = mapViewerBootstrap(
    data as ViewerBootstrapPayload | undefined,
  )
  const hasViewer = Boolean(bootstrap?.viewer)
  const { data: unreadNotificationsData } = useQuery({
    ...notificationsUnreadCountQueryOptions(),
    enabled: hasViewer,
    staleTime: 30_000,
  })

  if (!bootstrap) {
    return <Outlet />
  }

  const viewer = bootstrap.viewer
  const viewerForShell = viewer
    ? {
        displayName: viewer.displayName,
        githubUsername: viewer.githubUsername,
        avatarUrl: viewer.avatarUrl,
        city: viewer.cityName ?? undefined,
      }
    : undefined

  return (
    <AppLayout
      viewer={viewerForShell ?? null}
      unreadNotifications={
        typeof unreadNotificationsData === 'number'
          ? unreadNotificationsData
          : 0
      }
      unreadMessages={viewer?.unreadMessagesCount ?? 0}
    >
      <Outlet />
    </AppLayout>
  )
}
