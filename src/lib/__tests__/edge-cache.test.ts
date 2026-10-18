import { describe, expect, it, vi } from 'vitest'
import {
  CACHE_STATUS_HEADER,
  cacheDecision,
  hasClerkSession,
  isCacheableRequest,
  isCacheableResponse,
  withEdgeCache,
} from '../edge-cache'

const ORIGIN = 'https://locatic.dev'

function get(
  path: string,
  cookie?: string,
  method = 'GET',
  headers: Record<string, string> = {},
) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: cookie ? { cookie, ...headers } : headers,
  })
}

/** A page as Clerk's middleware returns it to a signed-out visitor. */
function html(body = '<p>page</p>', headers: Record<string, string> = {}) {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-clerk-auth-status': 'signed-out',
      ...headers,
    },
  })
}

/** A page as Clerk's middleware returns it to a signed-in member: no status. */
function memberHtml(body = '<p>member</p>') {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

/** An in-memory stand-in for `caches.default`. */
function memoryCache() {
  const entries = new Map<string, Response>()
  return {
    entries,
    match: vi.fn(async (key: RequestInfo | URL) => {
      const hit = entries.get(new Request(key).url)
      return hit?.clone()
    }),
    put: vi.fn(async (key: RequestInfo | URL, response: Response) => {
      entries.set(new Request(key).url, response.clone())
    }),
  }
}

describe('hasClerkSession', () => {
  it('spots session, development and signed-in client cookies', () => {
    expect(hasClerkSession('__session=abc')).toBe(true)
    expect(hasClerkSession('theme=dark; __session_Xy12=abc')).toBe(true)
    expect(hasClerkSession('__clerk_db_jwt=dvb_1')).toBe(true)
    expect(hasClerkSession('__client_uat=1699999999')).toBe(true)
  })

  it('treats no cookies or a signed-out client as anonymous', () => {
    expect(hasClerkSession(null)).toBe(false)
    expect(hasClerkSession('__client_uat=0')).toBe(false)
    expect(hasClerkSession('__client_uat_abc=0; theme=dark')).toBe(false)
  })
})

describe('isCacheableRequest', () => {
  it('accepts signed-out GETs of public pages', () => {
    for (const path of [
      '/',
      '/about',
      '/explore',
      '/terms',
      '/c/bengaluru-in',
      '/u/ada',
      '/project/ada/engine',
    ]) {
      expect(isCacheableRequest(get(path)), path).toBe(true)
    }
  })

  it('refuses sessions, other methods, queries and private paths', () => {
    expect(isCacheableRequest(get('/c/bengaluru-in', '__session=a'))).toBe(
      false,
    )
    expect(
      isCacheableRequest(get('/c/bengaluru-in', '__client_uat=1699999999')),
    ).toBe(false)
    expect(isCacheableRequest(get('/explore', undefined, 'POST'))).toBe(false)
    expect(isCacheableRequest(get('/explore?mode=builders'))).toBe(false)
    expect(
      isCacheableRequest(
        get('/explore', undefined, 'GET', { authorization: 'Bearer token' }),
      ),
    ).toBe(false)
    for (const path of [
      '/home',
      '/settings',
      '/_serverFn/abc',
      '/sitemap.xml',
      '/project/ada',
      '/u/ada/extra',
    ]) {
      expect(isCacheableRequest(get(path)), path).toBe(false)
    }
  })
})

describe('isCacheableResponse', () => {
  it('accepts an HTML page Clerk marked signed-out', () => {
    expect(isCacheableResponse(html())).toBe(true)
  })

  it('refuses a page without a signed-out status (signed-in renders carry none)', () => {
    expect(isCacheableResponse(memberHtml())).toBe(false)
  })

  it('refuses cookies, redirects, other types and signed-in renders', () => {
    expect(isCacheableResponse(html('', { 'set-cookie': 'a=b' }))).toBe(false)
    expect(
      isCacheableResponse(html('', { 'cache-control': 'private, max-age=0' })),
    ).toBe(false)
    expect(isCacheableResponse(html('', { 'cache-control': 'no-store' }))).toBe(
      false,
    )
    expect(
      isCacheableResponse(
        new Response(null, { status: 307, headers: { location: '/' } }),
      ),
    ).toBe(false)
    expect(
      isCacheableResponse(
        new Response('{}', { headers: { 'content-type': 'application/json' } }),
      ),
    ).toBe(false)
    expect(
      isCacheableResponse(html('', { 'x-clerk-auth-status': 'signed-in' })),
    ).toBe(false)
    expect(
      isCacheableResponse(
        new Response('missing', {
          status: 404,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    ).toBe(false)
  })
})

describe('cacheDecision', () => {
  it('is fresh for a minute, stale up to ten, then a miss', () => {
    expect(cacheDecision(0)).toBe('fresh')
    expect(cacheDecision(59)).toBe('fresh')
    expect(cacheDecision(60)).toBe('stale')
    expect(cacheDecision(599)).toBe('stale')
    expect(cacheDecision(600)).toBe('miss')
    expect(cacheDecision(Number.NaN)).toBe('miss')
    expect(cacheDecision(-1)).toBe('miss')
  })
})

describe('withEdgeCache', () => {
  function setup() {
    let now = 1_000_000
    const cache = memoryCache()
    const pending: Array<Promise<unknown>> = []
    const render = vi.fn(async () =>
      html(`<p>render ${render.mock.calls.length}</p>`),
    )
    let buildId = 'build-1'
    const deps = {
      cache,
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      get buildId() {
        return buildId
      },
      now: () => now,
    }
    return {
      cache,
      render,
      run: (request: Request) => withEdgeCache(request, render, deps),
      advance: (seconds: number) => (now += seconds * 1000),
      deploy: (id: string) => (buildId = id),
      settle: () => Promise.all(pending.splice(0)),
    }
  }

  it('renders, stores, then serves the stored copy while fresh', async () => {
    const edge = setup()
    const first = await edge.run(get('/about'))
    expect(first.headers.get(CACHE_STATUS_HEADER)).toBe('MISS')
    expect(await first.text()).toBe('<p>render 1</p>')
    await edge.settle()

    edge.advance(30)
    const second = await edge.run(get('/about'))
    expect(second.headers.get(CACHE_STATUS_HEADER)).toBe('HIT')
    expect(await second.text()).toBe('<p>render 1</p>')
    expect(edge.render).toHaveBeenCalledTimes(1)
    // Internals stay at the edge; the browser gets the page's own headers.
    expect(second.headers.get('cache-control')).toBeNull()
    expect(second.headers.get('x-locatic-cached-at')).toBeNull()
  })

  it('serves a stale copy and refreshes it in the background', async () => {
    const edge = setup()
    await edge.run(get('/about'))
    await edge.settle()

    edge.advance(120)
    const stale = await edge.run(get('/about'))
    expect(stale.headers.get(CACHE_STATUS_HEADER)).toBe('STALE')
    expect(await stale.text()).toBe('<p>render 1</p>')
    await edge.settle()
    await edge.settle()
    expect(edge.render).toHaveBeenCalledTimes(2)

    const refreshed = await edge.run(get('/about'))
    expect(refreshed.headers.get(CACHE_STATUS_HEADER)).toBe('HIT')
    expect(await refreshed.text()).toBe('<p>render 2</p>')
  })

  it('renders again once a copy is too old', async () => {
    const edge = setup()
    await edge.run(get('/about'))
    await edge.settle()
    edge.advance(601)
    const response = await edge.run(get('/about'))
    expect(response.headers.get(CACHE_STATUS_HEADER)).toBe('MISS')
    expect(edge.render).toHaveBeenCalledTimes(2)
  })

  it('never serves a page stored by another build', async () => {
    const edge = setup()
    await edge.run(get('/about'))
    await edge.settle()
    edge.deploy('build-2')
    const response = await edge.run(get('/about'))
    expect(response.headers.get(CACHE_STATUS_HEADER)).toBe('MISS')
    expect(await response.text()).toBe('<p>render 2</p>')
  })

  it('never serves or stores a page for a signed-in request', async () => {
    const edge = setup()
    await edge.run(get('/about'))
    await edge.settle()
    const member = await edge.run(get('/about', '__session=abc'))
    expect(member.headers.get(CACHE_STATUS_HEADER)).toBeNull()
    expect(edge.render).toHaveBeenCalledTimes(2)
    expect(edge.cache.put).toHaveBeenCalledTimes(1)
  })

  it('never serves or stores a page for a Bearer-authenticated request', async () => {
    const edge = setup()
    const bearer = () =>
      get('/explore', undefined, 'GET', { authorization: 'Bearer token' })
    edge.render.mockImplementationOnce(async () => memberHtml())
    const cold = await edge.run(bearer())
    expect(await cold.text()).toBe('<p>member</p>')
    await edge.settle()
    expect(edge.cache.put).not.toHaveBeenCalled()

    await edge.run(get('/explore'))
    await edge.settle()
    const member = await edge.run(bearer())
    expect(member.headers.get(CACHE_STATUS_HEADER)).toBeNull()
    expect(edge.render).toHaveBeenCalledTimes(3)
  })

  it('does not store a render Clerk did not mark signed-out', async () => {
    const edge = setup()
    edge.render.mockImplementationOnce(async () => memberHtml())
    const response = await edge.run(get('/about'))
    expect(response.headers.get(CACHE_STATUS_HEADER)).toBeNull()
    await edge.settle()
    expect(edge.cache.put).not.toHaveBeenCalled()
  })

  it('refreshes a stale page once for a burst of requests', async () => {
    const edge = setup()
    await edge.run(get('/about'))
    await edge.settle()
    edge.advance(120)

    const burst = await Promise.all(
      Array.from({ length: 20 }, () => edge.run(get('/about'))),
    )
    expect(
      burst.every((r) => r.headers.get(CACHE_STATUS_HEADER) === 'STALE'),
    ).toBe(true)
    await edge.settle()
    expect(edge.render).toHaveBeenCalledTimes(2)

    // The next stale window refreshes again.
    edge.advance(120)
    await edge.run(get('/about'))
    await edge.settle()
    expect(edge.render).toHaveBeenCalledTimes(3)
  })

  it('refreshes again after a failed refresh', async () => {
    const edge = setup()
    await edge.run(get('/about'))
    await edge.settle()
    edge.advance(120)
    edge.render.mockImplementationOnce(async () => {
      throw new Error('render failed')
    })
    expect(
      (await edge.run(get('/about'))).headers.get(CACHE_STATUS_HEADER),
    ).toBe('STALE')
    await edge.settle()

    await edge.run(get('/about'))
    await edge.settle()
    expect(edge.render).toHaveBeenCalledTimes(3)
    const refreshed = await edge.run(get('/about'))
    expect(refreshed.headers.get(CACHE_STATUS_HEADER)).toBe('HIT')
  })

  it('keeps the browser Cache-Control the page set', async () => {
    const edge = setup()
    edge.render.mockImplementationOnce(async () =>
      html('<p>x</p>', { 'cache-control': 'public, max-age=30' }),
    )
    await edge.run(get('/about'))
    await edge.settle()
    const hit = await edge.run(get('/about'))
    expect(hit.headers.get('cache-control')).toBe('public, max-age=30')
  })

  it('does not store a response it may not share', async () => {
    const edge = setup()
    edge.render.mockImplementationOnce(async () =>
      html('<p>x</p>', { 'set-cookie': '__client_uat=0' }),
    )
    const response = await edge.run(get('/about'))
    expect(response.headers.get(CACHE_STATUS_HEADER)).toBeNull()
    await edge.settle()
    expect(edge.cache.put).not.toHaveBeenCalled()
  })
})
