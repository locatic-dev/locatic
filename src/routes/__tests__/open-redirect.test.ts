import { describe, expect, it } from 'vitest'

/**
 * TanStack Router builds a route's search as `{ ...parentSearch, ...validated }`
 * (@tanstack/router-core 1.170.1, router.js matchRoutes), so a key that
 * `validateSearch` leaves out keeps its raw URL value. These tests run each
 * auth route's own `validateSearch` through that merge and then its
 * `beforeLoad`, the way the router does.
 */
type RouteOptions = {
  validateSearch: (search: Record<string, unknown>) => Record<string, unknown>
  beforeLoad: (args: unknown) => Promise<unknown>
}

async function optionsOf(route: 'signIn' | 'signUp' | 'onboarding') {
  const modules = {
    signIn: () => import('@/routes/sign-in.$'),
    signUp: () => import('@/routes/sign-up.$'),
    onboarding: () => import('@/routes/onboarding'),
  }
  const { Route } = (await modules[route]()) as unknown as {
    Route: { options: RouteOptions }
  }
  return Route.options
}

function routerSearch(
  options: RouteOptions,
  rawSearch: Record<string, unknown>,
) {
  return { ...rawSearch, ...options.validateSearch(rawSearch) }
}

const context = (authenticated: boolean, needsOnboarding = false) => ({
  auth: { isAuthenticated: authenticated },
  queryClient: {
    ensureQueryData: async () => ({ needsOnboarding }),
  },
})

const UNSAFE = [
  'https://evil.example/',
  '//evil.example',
  'javascript:alert(1)',
  '/sign-in',
]

describe('auth routes never redirect to an unsafe destination', () => {
  it.each(UNSAFE)('sign-in (signed in) ignores redirect=%s', async (raw) => {
    const options = await optionsOf('signIn')
    const search = routerSearch(options, { redirect: raw })

    expect(search.redirect).toBeUndefined()
    await expect(
      options.beforeLoad({ context: context(true), search }),
    ).rejects.toMatchObject({ options: { to: '/home' } })
  })

  it.each(UNSAFE)('sign-up forwards no redirect=%s', async (raw) => {
    const options = await optionsOf('signUp')
    const search = routerSearch(options, { redirect: raw })

    await expect(
      options.beforeLoad({ context: context(false), search }),
    ).rejects.toMatchObject({
      options: { to: '/sign-in/$', search: { redirect: undefined } },
    })
  })

  it.each(UNSAFE)(
    'onboarding (already done) ignores redirect=%s',
    async (raw) => {
      const options = await optionsOf('onboarding')
      const search = routerSearch(options, { redirect: raw })

      await expect(
        options.beforeLoad({ context: context(true), search }),
      ).rejects.toMatchObject({ options: { to: '/home' } })
    },
  )

  it('still follows a safe destination', async () => {
    const options = await optionsOf('signIn')
    const search = routerSearch(options, { redirect: '/c/berlin#builders' })

    await expect(
      options.beforeLoad({ context: context(true), search }),
    ).rejects.toMatchObject({ options: { href: '/c/berlin#builders' } })
  })
})

describe('other routes keep raw values out of validated search', () => {
  it('explore drops invalid filters instead of letting the raw value through', async () => {
    const { Route } = await import('@/routes/explore')
    const options = Route.options as unknown as RouteOptions
    const raw = {
      language: 'x'.repeat(200),
      openToCollab: 'yes',
      selectedCityIds: ['<script>'],
    }

    expect(routerSearch(options, raw)).toMatchObject({
      language: undefined,
      openToCollab: undefined,
      selectedCityIds: [],
    })
  })

  it('the project page drops malformed deep-link values', async () => {
    const { Route } = await import('@/routes/_app/project.$owner.$repo')
    const options = Route.options as unknown as RouteOptions

    expect(
      routerSearch(options, { comment: 123, post: '  ', thread: null }),
    ).toMatchObject({
      comment: undefined,
      post: undefined,
      thread: undefined,
    })
  })
})
