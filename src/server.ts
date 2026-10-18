import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { waitUntil } from 'cloudflare:workers'
import { withEdgeCache } from '@/lib/edge-cache'

// The Worker's entry (wrangler `main`): TanStack Start's own handler behind
// the edge cache for signed-out public pages (src/lib/edge-cache.ts).

/** The Workers default cache; absent outside the Workers runtime. */
function edgeCache(): Cache | null {
  const storage = globalThis.caches as
    | (CacheStorage & { default?: Cache })
    | undefined
  return storage?.default ?? null
}

export default createServerEntry({
  fetch(request, opts) {
    // Off in `vite dev`: hot updates change the client without a new build.
    const cache = import.meta.env.DEV ? null : edgeCache()
    const render = async (req: Request) => handler.fetch(req, opts)
    return cache
      ? withEdgeCache(request, render, {
          cache,
          waitUntil,
          buildId: __LOCATIC_BUILD_ID__,
        })
      : render(request)
  },
})
