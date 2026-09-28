import { useSyncExternalStore } from 'react'
import { toSafeRelativeUrl } from '@/lib/safe-redirect'

/** The URL without its fragment. */
export function stripHash(href: string): string {
  const hashIndex = href.indexOf('#')
  return hashIndex === -1 ? href : href.slice(0, hashIndex)
}

function subscribeToHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

const readHash = () => window.location.hash
const serverHash = () => ''

/**
 * The current URL for a sign-in return link: its path and query, plus the
 * hash once running in the browser. The server never sees the hash, so the
 * server render and hydration leave it out and the client adds it right
 * after, which keeps the link's href identical across SSR and hydration.
 */
export function useHydrationSafeHref(href: string): string {
  const hash = useSyncExternalStore(subscribeToHash, readHash, serverHash)

  return `${stripHash(href)}${hash}`
}

/**
 * The sign-in `redirect` for the page being viewed (plan item A6), or
 * undefined when the URL is not a safe destination.
 */
export function useSignInReturnHref(href: string): string | undefined {
  return toSafeRelativeUrl(useHydrationSafeHref(href)) ?? undefined
}
