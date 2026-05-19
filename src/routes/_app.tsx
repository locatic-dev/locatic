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
    <div className="flex h-dvh bg-canvas">
      <div className="hidden h-full w-(--lx-sidebar-width) flex-col gap-4 border-r border-line bg-canvas p-5 md:flex">
        <div className="lx-skeleton h-5.5 w-30" />
        <div className="mt-2 flex flex-col gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="lx-skeleton h-8 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 px-6 py-6 md:px-8">
        <div className="lx-skeleton h-10 w-2/5" />
        <div className="lx-skeleton h-30 rounded-[6px]" />
        <div className="lx-skeleton h-30 rounded-[6px]" />
        <div className="lx-skeleton h-30 rounded-[6px]" />
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
