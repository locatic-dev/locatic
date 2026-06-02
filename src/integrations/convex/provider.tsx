import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/tanstack-react-start'
import { useConvexAuth } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'

import { convexClient } from './client'

export default function AppConvexProvider({
  children,
  queryClient,
}: {
  children: React.ReactNode
  queryClient: QueryClient
}) {
  return (
    <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ConvexProviderWithClerk>
  )
}

export function ConvexAuthReadyBoundary({
  children,
  fallback = null,
  requireAuthenticated = false,
}: {
  children: React.ReactNode
  fallback?: React.ReactNode
  requireAuthenticated?: boolean
}) {
  const convexAuth = useConvexAuth()

  if (
    convexAuth.isLoading ||
    (requireAuthenticated && !convexAuth.isAuthenticated)
  ) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
