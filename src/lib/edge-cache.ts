// Edge cache for signed-out HTML of public pages, used by src/server.ts.
// Rendering a page costs a Convex round trip or more; crawlers and visitors
// mostly arrive without a session, so their copy of a public page is the
// same for everyone. A copy is served fresh for a minute, then served stale
// while one background render per isolate refreshes it, and dropped after
// ten minutes. Requests with any Clerk session cookie or an Authorization
// header always render.

/** Seconds a stored page is served without a refresh. */
export const EDGE_FRESH_SECONDS = 60
/** Seconds a stored page may be served at all (refreshed in the background). */
export const EDGE_STALE_SECONDS = 600

const CACHED_AT_HEADER = 'x-locatic-cached-at'
/** The page's own Cache-Control, restored when a stored copy is served. */
const BROWSER_CACHE_CONTROL_HEADER = 'x-locatic-cache-control'
/** HIT, STALE or MISS, for checking the cache from outside. */
export const CACHE_STATUS_HEADER = 'x-locatic-cache'

const CACHEABLE_PATH =
  /^\/(?:about|explore|privacy|terms|c\/[^/]+|u\/[^/]+|project\/[^/]+\/[^/]+)?$/

/**
 * True when the request carries a Clerk session: `__session`, a
 * `__client_uat` other than 0 (signed in on another tab), or the
 * development-instance `__clerk_db_jwt`. Suffixed variants (`__session_x`)
 * count too.
 */
export function hasClerkSession(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false
  return cookieHeader.split(';').some((part) => {
    const [rawName = '', ...rest] = part.split('=')
    const name = rawName.trim()
    const value = rest.join('=').trim()
    if (name === '__session' || name.startsWith('__session_')) return true
    if (name === '__clerk_db_jwt' || name.startsWith('__clerk_db_jwt_')) {
      return true
    }
    if (name === '__client_uat' || name.startsWith('__client_uat_')) {
      return value !== '' && value !== '0'
    }
    return false
  })
}

/**
 * A signed-out GET of a public page with no query string. Clerk also accepts
 * a session token as a Bearer `Authorization` header, so one never reads or
 * fills the shared copy.
 */
export function isCacheableRequest(request: Request): boolean {
  if (request.method !== 'GET') return false
  const url = new URL(request.url)
  return (
    url.search === '' &&
    CACHEABLE_PATH.test(url.pathname) &&
    !request.headers.has('authorization') &&
    !hasClerkSession(request.headers.get('cookie'))
  )
}

/**
 * A complete, anonymous HTML page: nothing personal, nothing to set, and not
 * marked private by the app. Clerk's middleware marks only signed-out renders
 * with `x-clerk-auth-status` (signed-in ones carry no status), so the page
 * must say `signed-out` rather than merely not say `signed-in`.
 */
export function isCacheableResponse(response: Response): boolean {
  const cacheControl = response.headers.get('cache-control') ?? ''
  return (
    !/\b(?:private|no-store)\b/i.test(cacheControl) &&
    response.status === 200 &&
    (response.headers.get('content-type') ?? '').startsWith('text/html') &&
    !response.headers.has('set-cookie') &&
    response.headers.get('x-clerk-auth-status') === 'signed-out'
  )
}

export type CacheDecision = 'fresh' | 'stale' | 'miss'

export function cacheDecision(ageSeconds: number): CacheDecision {
  if (ageSeconds < 0 || !Number.isFinite(ageSeconds)) return 'miss'
  if (ageSeconds < EDGE_FRESH_SECONDS) return 'fresh'
  if (ageSeconds < EDGE_STALE_SECONDS) return 'stale'
  return 'miss'
}

type EdgeCacheDeps = {
  cache: Pick<Cache, 'match' | 'put'>
  waitUntil: (promise: Promise<unknown>) => void
  /**
   * The build serving the request. Stored pages name hashed assets of the
   * build that rendered them, so each build reads only its own copies.
   */
  buildId: string
  now?: () => number
}

/** The copy the edge stores: its own expiry, the time it was rendered. */
function toStoredResponse(response: Response, now: number): Response {
  const stored = new Response(response.body, response)
  const browserCacheControl = response.headers.get('cache-control')
  if (browserCacheControl) {
    stored.headers.set(BROWSER_CACHE_CONTROL_HEADER, browserCacheControl)
  }
  stored.headers.set('cache-control', `public, max-age=${EDGE_STALE_SECONDS}`)
  stored.headers.set(CACHED_AT_HEADER, String(now))
  return stored
}

/** A stored copy as the browser gets it: the page's headers, no internals. */
function toServedResponse(stored: Response, status: string): Response {
  const served = new Response(stored.body, stored)
  const browserCacheControl = served.headers.get(BROWSER_CACHE_CONTROL_HEADER)
  if (browserCacheControl) {
    served.headers.set('cache-control', browserCacheControl)
  } else {
    served.headers.delete('cache-control')
  }
  served.headers.delete(BROWSER_CACHE_CONTROL_HEADER)
  served.headers.delete(CACHED_AT_HEADER)
  served.headers.set(CACHE_STATUS_HEADER, status)
  return served
}

/**
 * Background refreshes in flight in this isolate, by cache key, so a burst of
 * stale requests renders a page once. Each entry lasts until its copy is
 * stored or the refresh fails.
 */
const refreshing = new Map<string, Promise<unknown>>()

/**
 * Serves `request` from the edge cache when it can, otherwise renders it
 * with `render` and stores an eligible result. Failures of the cache itself
 * fall back to rendering.
 */
export async function withEdgeCache(
  request: Request,
  render: (request: Request) => Promise<Response>,
  { cache, waitUntil, buildId, now = Date.now }: EdgeCacheDeps,
): Promise<Response> {
  if (!isCacheableRequest(request)) {
    return render(request)
  }

  const keyUrl = new URL(request.url)
  keyUrl.searchParams.set('build', buildId)
  const key = new Request(keyUrl.toString(), { method: 'GET' })
  /** Renders the page; `stored` settles once an eligible copy is stored. */
  const renderAndStore = async () => {
    const response = await render(request)
    if (!isCacheableResponse(response)) {
      return { response, stored: null }
    }
    const stored = cache
      .put(key, toStoredResponse(response.clone(), now()))
      .catch(() => undefined)
    return { response, stored }
  }

  const cached = await cache.match(key).catch(() => undefined)
  const cachedAt = Number(cached?.headers.get(CACHED_AT_HEADER))
  const decision = cached
    ? cacheDecision((now() - cachedAt) / 1000)
    : ('miss' as const)

  if (cached && decision === 'fresh') {
    return toServedResponse(cached, 'HIT')
  }
  if (cached && decision === 'stale') {
    if (!refreshing.has(key.url)) {
      const refresh = renderAndStore()
        .then(({ stored }) => stored)
        .catch(() => undefined)
        .finally(() => refreshing.delete(key.url))
      refreshing.set(key.url, refresh)
      waitUntil(refresh)
    }
    return toServedResponse(cached, 'STALE')
  }

  const { response, stored } = await renderAndStore()
  if (!stored) return response
  waitUntil(stored)
  const served = new Response(response.body, response)
  served.headers.set(CACHE_STATUS_HEADER, 'MISS')
  return served
}
