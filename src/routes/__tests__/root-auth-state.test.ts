import { ClerkAPIResponseError } from '@clerk/backend/errors'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteAuthState } from '@/lib/auth-routing'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getToken: vi.fn(),
  getSession: vi.fn(),
}))
vi.mock('@clerk/tanstack-react-start/server', () => ({
  auth: mocks.auth,
  clerkClient: () => ({ sessions: { getSession: mocks.getSession } }),
}))
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ handler: (fn: unknown) => fn }),
}))
vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  createRootRouteWithContext: () => (options: unknown) => ({ options }),
  createFileRoute: () => (options: unknown) => ({ options }),
}))
vi.mock('@/integrations/clerk/provider', () => ({ default: () => null }))
vi.mock('@/integrations/convex/provider', () => ({
  default: () => null,
  ConvexAuthReadyBoundary: () => null,
}))

const signedOut = { isAuthenticated: false, token: null, userId: null }
function apiError(status: number, message = 'Session not found') {
  return new ClerkAPIResponseError('Request failed', {
    status,
    data: [{ code: 'resource_not_found', message }],
  })
}
const session = () => ({
  isAuthenticated: true,
  sessionClaims: { aud: 'web' },
  sessionId: 'session_test',
  userId: 'user_test',
  getToken: mocks.getToken,
})
async function loadRoot() {
  const { Route } = await import('../__root')
  const setAuth = vi.fn(),
    clearAuth = vi.fn()
  const beforeLoad = Route.options.beforeLoad as (
    args: unknown,
  ) => Promise<{ auth: RouteAuthState }>
  const result = await beforeLoad({
    context: {
      convexQueryClient: { serverHttpClient: { setAuth, clearAuth } },
    },
  })
  return { ...result, setAuth, clearAuth }
}

beforeEach(() => {
  vi.stubEnv('CLERK_SECRET_KEY', 'test-only-placeholder')
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue(session())
  mocks.getToken.mockResolvedValue('test-convex-token')
  mocks.getSession.mockResolvedValue({ status: 'active' })
})
afterEach(() => vi.unstubAllEnvs())

describe('root server auth after sign-out', () => {
  it.each(['ended', 'removed', 'revoked', 'expired', 'abandoned'])(
    'clears Convex auth and routes a stale %s session to sign-in',
    async (status) => {
      mocks.getToken.mockRejectedValue(apiError(404))
      mocks.getSession.mockResolvedValue({ status })
      const result = await loadRoot()
      expect(result.auth).toEqual(signedOut)
      expect(result.clearAuth).toHaveBeenCalledOnce()
      expect(result.setAuth).not.toHaveBeenCalled()
      expect(mocks.getSession).toHaveBeenCalledExactlyOnceWith('session_test')
      const { Route } = await import('../_app')
      const privateQuery = vi.fn()
      const beforeLoad = Route.options.beforeLoad as (
        args: unknown,
      ) => Promise<unknown>
      await expect(
        beforeLoad({
          context: {
            auth: result.auth,
            queryClient: { ensureQueryData: privateQuery },
          },
          location: { pathname: '/inbox', href: '/inbox?tab=requests' },
        }),
      ).rejects.toMatchObject({
        options: {
          to: '/sign-in/$',
          search: { redirect: '/inbox?tab=requests' },
        },
      })
      expect(privateQuery).not.toHaveBeenCalled()
    },
  )

  it('clears auth when the session itself no longer exists', async () => {
    mocks.getToken.mockRejectedValue(apiError(404))
    mocks.getSession.mockRejectedValue(apiError(404))
    const result = await loadRoot()
    expect(result.auth).toEqual(signedOut)
    expect(result.clearAuth).toHaveBeenCalledOnce()
  })

  it('does not hide a missing JWT template for an active session', async () => {
    const error = apiError(404, 'JWT template not found')
    mocks.getToken.mockRejectedValue(error)
    await expect(loadRoot()).rejects.toBe(error)
  })

  it.each([401, 403, 429, 500])(
    'propagates token failures with status %i without a session lookup',
    async (status) => {
      const error = apiError(status)
      mocks.getToken.mockRejectedValue(error)
      await expect(loadRoot()).rejects.toBe(error)
      expect(mocks.getSession).not.toHaveBeenCalled()
    },
  )

  it('does not mistake a generic Not Found error for a Clerk missing session', async () => {
    const error = Object.assign(new Error('Not Found'), { status: 404 })
    mocks.getToken.mockRejectedValue(error)
    await expect(loadRoot()).rejects.toBe(error)
    expect(mocks.getSession).not.toHaveBeenCalled()
  })

  it('propagates session lookup failures instead of claiming sign-out', async () => {
    const error = new Error('provider unavailable')
    mocks.getToken.mockRejectedValue(apiError(404))
    mocks.getSession.mockRejectedValue(error)
    await expect(loadRoot()).rejects.toBe(error)
  })

  it('requests the Convex template and keeps successful auth without a lookup', async () => {
    const result = await loadRoot()
    expect(result.auth).toEqual({
      isAuthenticated: true,
      token: 'test-convex-token',
      userId: 'user_test',
    })
    expect(mocks.getToken).toHaveBeenCalledExactlyOnceWith({
      template: 'convex',
    })
    expect(result.setAuth).toHaveBeenCalledExactlyOnceWith('test-convex-token')
    expect(mocks.getSession).not.toHaveBeenCalled()
  })

  it('reuses a Convex-audience session token without requesting a template', async () => {
    mocks.auth.mockResolvedValue({
      ...session(),
      sessionClaims: { aud: 'convex' },
    })
    await loadRoot()
    expect(mocks.getToken).toHaveBeenCalledExactlyOnceWith(undefined)
  })

  it('does not request a token or read a session for an anonymous request', async () => {
    mocks.auth.mockResolvedValue({
      ...session(),
      isAuthenticated: false,
      sessionId: null,
      userId: null,
    })
    const result = await loadRoot()
    expect(result.auth).toEqual(signedOut)
    expect(result.clearAuth).toHaveBeenCalledOnce()
    expect(mocks.getToken).not.toHaveBeenCalled()
    expect(mocks.getSession).not.toHaveBeenCalled()
  })
})
