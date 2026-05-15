import { ConvexQueryClient } from '@convex-dev/react-query'
import { QueryClient } from '@tanstack/react-query'
import { ConvexReactClient } from 'convex/react'

const convexUrl = import.meta.env.VITE_CONVEX_URL

if (!convexUrl) {
  throw new Error('VITE_CONVEX_URL is required')
}

export const convexClient = new ConvexReactClient(convexUrl)

export function createAppQueryClient() {
  const convexQueryClient = new ConvexQueryClient(convexClient, {
    dangerouslyUseInconsistentQueriesDuringSSR: false,
  })

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
        staleTime: 30_000,
      },
    },
  })

  convexQueryClient.connect(queryClient)

  return queryClient
}
