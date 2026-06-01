import { describe, expect, it, vi } from 'vitest'

import {
  createClientRouteAuthStateGetter,
  isProjectDetailPath,
  shouldPrefetchPrivateConvexQueries,
} from '../auth-routing'

describe('auth routing helpers', () => {
  it('dedupes concurrent client auth requests', async () => {
    let resolveAuth:
      | ((value: {
          isAuthenticated: boolean
          token: string | null
          userId: string | null
        }) => void)
      | undefined

    const fetchAuth = vi.fn(
      () =>
        new Promise<{
          isAuthenticated: boolean
          token: string | null
          userId: string | null
        }>((resolve) => {
          resolveAuth = resolve
        }),
    )
    const getAuthState = createClientRouteAuthStateGetter(fetchAuth)

    const firstCall = getAuthState()
    const secondCall = getAuthState()

    expect(fetchAuth).toHaveBeenCalledTimes(1)
    expect(firstCall).toBe(secondCall)

    resolveAuth?.({
      isAuthenticated: true,
      token: 'token_1',
      userId: 'user_1',
    })

    await expect(firstCall).resolves.toEqual({
      isAuthenticated: true,
      token: 'token_1',
      userId: 'user_1',
    })
  })

  it('refetches after the in-flight auth request settles', async () => {
    const fetchAuth = vi
      .fn()
      .mockResolvedValueOnce({
        isAuthenticated: true,
        token: 'token_1',
        userId: 'user_1',
      })
      .mockResolvedValueOnce({
        isAuthenticated: false,
        token: null,
        userId: null,
      })
    const getAuthState = createClientRouteAuthStateGetter(fetchAuth)

    await expect(getAuthState()).resolves.toEqual({
      isAuthenticated: true,
      token: 'token_1',
      userId: 'user_1',
    })
    await expect(getAuthState()).resolves.toEqual({
      isAuthenticated: false,
      token: null,
      userId: null,
    })

    expect(fetchAuth).toHaveBeenCalledTimes(2)
  })

  it('treats project detail pages as standalone routes', () => {
    expect(isProjectDetailPath('/project/octocat/hello-world')).toBe(true)
    expect(isProjectDetailPath('/projects')).toBe(false)
    expect(isProjectDetailPath('/settings')).toBe(false)
  })

  it('prefetches private Convex queries only during SSR', () => {
    expect(shouldPrefetchPrivateConvexQueries()).toBe(true)

    vi.stubGlobal('window', {})

    expect(shouldPrefetchPrivateConvexQueries()).toBe(false)

    vi.unstubAllGlobals()
  })
})
