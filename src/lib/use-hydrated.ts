import { useSyncExternalStore } from 'react'

// The server snapshot is what the server rendered, so hydration always
// matches; React re-renders with `true` right after.
const subscribeNever = () => () => {}
const readHydrated = () => true
const readServerHydrated = () => false

/**
 * False during the server render and hydration, true afterwards. For markup
 * that only helps in the browser (tooltips, canvas), so server HTML stays
 * lean and still hydrates.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNever, readHydrated, readServerHydrated)
}
