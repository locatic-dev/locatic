import type { QueryClient } from '@tanstack/react-query'

const sessions = new WeakMap<QueryClient, object>()

/** Capture ownership before async work; a retired session may not write back. */
export function captureSessionCache(queryClient: QueryClient) {
  let session = sessions.get(queryClient)
  if (!session) {
    session = {}
    sessions.set(queryClient, session)
  }
  return () => sessions.get(queryClient) === session
}

export function clearSessionCache(queryClient: QueryClient) {
  sessions.set(queryClient, {})
  queryClient.clear()
}
