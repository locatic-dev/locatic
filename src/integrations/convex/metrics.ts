import { useCallback, useEffect } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useConvex, useConvexAuth } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import type { ClientMetricKey } from '../../../convex/metrics'

/**
 * Client side of the daily product counters (plan item E4; server in
 * convex/metrics.ts, keys in docs/metrics.md). Reports are fire-and-forget:
 * a failed or signed-out report is dropped and never reaches the user.
 */

// `api.metrics.record` once convex/_generated is regenerated with the module.
const recordMetricReference = makeFunctionReference<
  'mutation',
  { key: ClientMetricKey },
  null
>('metrics:record')

/** Returns a reporter for a client-side counter; a no-op outside Convex. */
export function useRecordMetric() {
  const convex = useConvex() as ReturnType<typeof useConvex> | undefined

  return useCallback(
    (key: ClientMetricKey) => {
      void convex?.mutation(recordMetricReference, { key }).catch(() => {})
    },
    [convex],
  )
}

/** Wraps empty-state actions so a click is counted before the action runs. */
export function useEmptyStateActionMetric() {
  const record = useRecordMetric()

  return useCallback(
    (action: () => void) => () => {
      record('empty_state_action')
      action()
    },
    [record],
  )
}

// ── Discovery journey completion: sign-in from a public discovery page and
// land back on it signed in. The sign-in page remembers the destination for
// this tab; the root counts it once the signed-in session reaches that path.

const DISCOVERY_RETURN_STORAGE_KEY = 'locatic:discovery-return'
const DISCOVERY_RETURN_TTL_MS = 30 * 60 * 1000
const DISCOVERY_PATH = /^\/(?:explore(?:\/|$)|u\/|c\/|project\/)/
// Routes a signed-in user passes through on the way back to the destination.
const AUTH_TRANSIT_PATH = /^\/(?:sign-in|sign-up|onboarding)(?:\/|$)/

type DiscoveryReturn = { path: string; at: number }

/** Path of a validated relative destination when it is a discovery page. */
export function discoveryReturnPath(destination: string | null | undefined) {
  if (!destination) return null
  const path = new URL(destination, 'https://destination.invalid').pathname
  return DISCOVERY_PATH.test(path) ? path : null
}

export function rememberDiscoveryReturn(
  destination: string | null | undefined,
  now: number = Date.now(),
) {
  const path = discoveryReturnPath(destination)
  if (!path) return
  try {
    window.sessionStorage.setItem(
      DISCOVERY_RETURN_STORAGE_KEY,
      JSON.stringify({ path, at: now } satisfies DiscoveryReturn),
    )
  } catch {
    // Storage unavailable (private mode, quota): the return is not counted.
  }
}

/**
 * True once, when `pathname` is the remembered discovery destination and the
 * marker is fresh. Consumes the marker when it matches, has expired, or the
 * signed-in user lands on a page that is neither a discovery page nor part of
 * the sign-in path (Home, settings): that journey did not return, and a later
 * visit to the destination must not count it.
 */
export function consumeDiscoveryReturn(
  pathname: string,
  now: number = Date.now(),
) {
  try {
    const raw = window.sessionStorage.getItem(DISCOVERY_RETURN_STORAGE_KEY)
    if (!raw) return false
    const marker = JSON.parse(raw) as Partial<DiscoveryReturn>
    const expired =
      typeof marker.at !== 'number' || now - marker.at > DISCOVERY_RETURN_TTL_MS
    const matches = marker.path === pathname
    if (
      !expired &&
      !matches &&
      (DISCOVERY_PATH.test(pathname) || AUTH_TRANSIT_PATH.test(pathname))
    ) {
      return false
    }
    window.sessionStorage.removeItem(DISCOVERY_RETURN_STORAGE_KEY)
    return !expired && matches
  } catch {
    return false
  }
}

/** Counts a discovery sign-in return; render once inside the Convex provider. */
export function DiscoveryReturnMetric() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const { isAuthenticated } = useConvexAuth()
  const record = useRecordMetric()

  useEffect(() => {
    if (isAuthenticated && consumeDiscoveryReturn(pathname)) {
      record('discovery_sign_in_return')
    }
  }, [isAuthenticated, pathname, record])

  return null
}
