import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { AppLayout } from '@/components/app-shell/app-layout'
import {
  mapViewerBootstrap,
  type ViewerBootstrapPayload,
} from '@/features/contracts'
import { viewerQueryOptions } from '@/features/viewer/queries'

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    if (location.pathname.startsWith('/project/')) {
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

function ShellSkeleton() {
  return (
    <div
      style={{ display: 'flex', height: '100dvh', background: 'var(--lx-bg)' }}
    >
      <div
        className="hidden md:flex"
        style={{
          width: 220,
          height: '100%',
          borderRight: '1px solid var(--lx-border)',
          background: 'var(--lx-bg)',
          padding: '20px',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div className="lx-skeleton" style={{ height: 22, width: 120 }} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginTop: 8,
          }}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="lx-skeleton"
              style={{ height: 32, borderRadius: 4 }}
            />
          ))}
        </div>
      </div>
      <div
        style={{
          flex: 1,
          padding: '24px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div className="lx-skeleton" style={{ height: 40, width: '40%' }} />
        <div className="lx-skeleton" style={{ height: 120, borderRadius: 6 }} />
        <div className="lx-skeleton" style={{ height: 120, borderRadius: 6 }} />
        <div className="lx-skeleton" style={{ height: 120, borderRadius: 6 }} />
      </div>
    </div>
  )
}

function AppFrame() {
  return <AuthenticatedApp />
}

function AuthenticatedApp() {
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  })
  const viewerQuery = useQuery(viewerQueryOptions())
  const bootstrap = mapViewerBootstrap(
    viewerQuery.data as ViewerBootstrapPayload | undefined,
  )

  // Guest accessing project detail — no auth session, render without shell
  if (!bootstrap && currentPath.startsWith('/project/')) {
    return <Outlet />
  }

  if (!bootstrap) return <ShellSkeleton />

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
