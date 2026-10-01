import { useSyncExternalStore } from 'react'

/** How often the shared clock moves on, so "just now" ages. */
export const HYDRATED_NOW_TICK_MS = 60_000

// One minute clock for every reader: the first subscriber starts a single
// interval and the last one to leave stops it. `now` is null while no clock
// runs, so the next reader starts from the current time.
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null
let now: number | null = null

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (timer === null) {
    // A render that never committed may have read the time long ago.
    if (now === null || Date.now() - now >= HYDRATED_NOW_TICK_MS) {
      now = Date.now()
    }
    timer = setInterval(() => {
      now = Date.now()
      for (const notify of listeners) notify()
    }, HYDRATED_NOW_TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
      now = null
    }
  }
}

function getSnapshot() {
  now ??= Date.now()
  return now
}

// The server snapshot is what the server rendered, so hydration matches;
// React re-renders with the client snapshot right after.
const getServerSnapshot = () => null

/**
 * The current time for clock-relative UI ("3h ago", the live dot), or null
 * during the server render and hydration. The server and the browser read
 * different clocks, so text or markup derived from `Date.now()` would not
 * hydrate; callers render it once this returns a number (and reserve its
 * space meanwhile). A component mounted after hydration gets a number on its
 * first render. Every reader shares one clock that advances each minute
 * while any of them is mounted.
 */
export function useHydratedNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
