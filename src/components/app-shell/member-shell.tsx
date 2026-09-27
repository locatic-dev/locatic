import type { ReactNode } from 'react'
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
import { ConvexAuthReadyBoundary } from '@/integrations/convex/provider'

/**
 * The persistent member app shell (sidebar, main region, mobile nav). The
 * frame paints immediately from the SSR'd viewer bootstrap, which the route
 * has already `ensureQueryData`'d, so `useSuspenseQuery` resolves on first
 * paint with no flash. Only `children` wait on the Convex auth handshake,
 * behind a content-scoped pending state; the frame never blocks on Convex
 * readiness.
 *
 * Without a viewer (a signed-out visitor on a public page) it renders
 * `withoutViewer` and no shell.
 */
export function MemberShell({
  children,
  withoutViewer,
}: {
  children: ReactNode
  withoutViewer: ReactNode
}) {
  const { data } = useSuspenseQuery(viewerQueryOptions())
  const bootstrap = mapViewerBootstrap(
    data as ViewerBootstrapPayload | undefined,
  )
  const viewer = bootstrap?.viewer
  const convexAuth = useConvexAuth()
  // Convex subscribes when the query enters the cache, even with `enabled:
  // false`. Skip its arguments until the authenticated viewer is ready.
  const { data: unreadNotificationsData } = useQuery({
    ...notificationsUnreadCountQueryOptions(
      Boolean(viewer) && convexAuth.isAuthenticated,
    ),
    staleTime: 30_000,
  })

  if (!viewer) {
    return <>{withoutViewer}</>
  }

  return (
    <AppLayout
      viewer={{
        displayName: viewer.displayName,
        githubUsername: viewer.githubUsername,
        avatarUrl: viewer.avatarUrl,
        city: viewer.cityName ?? undefined,
      }}
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
        {children}
      </ConvexAuthReadyBoundary>
    </AppLayout>
  )
}
