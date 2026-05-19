import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { AppLayout } from '@/components/app-shell/app-layout'
import {
  mapViewerBootstrap,
  type ViewerBootstrapPayload,
} from '@/features/contracts'
import { viewerQueryOptions } from '@/features/viewer/queries'
import { isProjectDetailPath } from '@/lib/auth-routing'

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    if (isProjectDetailPath(location.pathname)) {
      return
    }

    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/sign-in' })
    }

    const bootstrap = (await context.queryClient.ensureQueryData(
      viewerQueryOptions(),
    )) as ViewerBootstrapPayload

    if (bootstrap.needsOnboarding) {
      throw redirect({ to: '/onboarding' })
    }
  },
  component: AppFrame,
})

function AppFrame() {
  return <AuthenticatedApp />
}

function AuthenticatedApp() {
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  })

  if (isProjectDetailPath(currentPath)) {
    return <Outlet />
  }

  return <ShellApp />
}

function ShellApp() {
  const { data } = useSuspenseQuery(viewerQueryOptions())
  const bootstrap = mapViewerBootstrap(
    data as ViewerBootstrapPayload | undefined,
  )

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
    <AppLayout viewer={viewerForShell ?? null}>
      <Outlet />
    </AppLayout>
  )
}
