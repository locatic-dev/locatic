import { describe, expect, it } from 'vitest'

import { destinationFromAuthSearch } from '@/lib/safe-redirect'

type GuardArgs = {
  authenticated: boolean
  needsOnboarding?: boolean
  href?: string
  search?: Record<string, unknown>
  status?: string
}

function guardArgs({
  authenticated,
  needsOnboarding = false,
  href = '/',
  search = {},
  status,
}: GuardArgs) {
  const url = new URL(href, 'https://locatic.test')
  return {
    context: {
      auth: { isAuthenticated: authenticated },
      queryClient: {
        ensureQueryData: async () => ({
          isAuthenticated: authenticated,
          needsOnboarding,
          status,
          accountLifecycle: status
            ? { canRestore: status === 'deletion_pending', purgeAfter: 123 }
            : undefined,
        }),
      },
    },
    location: {
      hash: url.hash.replace(/^#/, ''),
      href,
      pathname: url.pathname,
      search,
    },
    search,
  }
}

type BeforeLoad = (args: unknown) => Promise<unknown>

async function beforeLoadOf(modulePath: string): Promise<BeforeLoad> {
  const routes: Record<string, () => Promise<{ Route: unknown }>> = {
    app: () => import('@/routes/_app'),
    landing: () => import('@/routes/index'),
    city: () => import('@/routes/c.$slug'),
    explore: () => import('@/routes/explore'),
    onboarding: () => import('@/routes/onboarding'),
    signIn: () => import('@/routes/sign-in.$'),
    signUp: () => import('@/routes/sign-up.$'),
  }
  const { Route } = (await routes[modulePath]!()) as {
    Route: { options: { beforeLoad: BeforeLoad } }
  }
  return Route.options.beforeLoad
}

describe('_app guard', () => {
  it('sends a signed-out visitor to sign-in with the full URL, query and hash kept', async () => {
    const beforeLoad = await beforeLoadOf('app')

    await expect(
      beforeLoad(
        guardArgs({
          authenticated: false,
          href: '/notifications?filter=unread#n1',
        }),
      ),
    ).rejects.toMatchObject({
      options: {
        to: '/sign-in/$',
        search: { redirect: '/notifications?filter=unread#n1' },
      },
    })
  })

  it('lets visitors read a project page without signing in', async () => {
    const beforeLoad = await beforeLoadOf('app')

    await expect(
      beforeLoad(
        guardArgs({ authenticated: false, href: '/project/ada/engine' }),
      ),
    ).resolves.toBeUndefined()
  })

  it('drops /home as a destination for members who still need onboarding', async () => {
    const beforeLoad = await beforeLoadOf('app')

    await expect(
      beforeLoad(
        guardArgs({
          authenticated: true,
          needsOnboarding: true,
          href: '/home',
        }),
      ),
    ).rejects.toMatchObject({
      options: { to: '/onboarding', search: { redirect: undefined } },
    })
  })

  it('carries any other destination through onboarding', async () => {
    const beforeLoad = await beforeLoadOf('app')

    await expect(
      beforeLoad(
        guardArgs({
          authenticated: true,
          needsOnboarding: true,
          href: '/settings?tab=privacy',
        }),
      ),
    ).rejects.toMatchObject({
      options: {
        to: '/onboarding',
        search: { redirect: '/settings?tab=privacy' },
      },
    })
  })

  it('lets onboarded members through', async () => {
    const beforeLoad = await beforeLoadOf('app')

    await expect(
      beforeLoad(guardArgs({ authenticated: true, href: '/inbox' })),
    ).resolves.toBeUndefined()
  })
})

describe.each(['deletion_pending', 'deletion_expired', 'purged'])(
  'account recovery guards for %s',
  (status) => {
    it('checks lifecycle before honoring a supplied sign-in destination', async () => {
      const beforeLoad = await beforeLoadOf('signIn')
      await expect(
        beforeLoad(
          guardArgs({
            authenticated: true,
            status,
            search: { redirect: '/settings?tab=account' },
          }),
        ),
      ).resolves.toMatchObject({ accountRecovery: { status } })
    })

    it.each([
      ['app', '/inbox'],
      ['onboarding', '/onboarding'],
      ['landing', '/'],
      ['explore', '/explore'],
      ['city', '/c/berlin'],
    ])(
      'routes %s to recovery instead of member or onboarding behavior',
      async (route, href) => {
        const beforeLoad = await beforeLoadOf(route)
        await expect(
          beforeLoad(guardArgs({ authenticated: true, status, href })),
        ).rejects.toMatchObject({
          options: { to: '/sign-in/$' },
        })
      },
    )
  },
)

describe('sign-in guard', () => {
  it('shows the sign-in page to signed-out visitors', async () => {
    const beforeLoad = await beforeLoadOf('signIn')

    await expect(
      beforeLoad(
        guardArgs({ authenticated: false, search: { redirect: '/explore' } }),
      ),
    ).resolves.toEqual({ accountRecovery: null })
  })

  it('sends a signed-in user to the preserved destination', async () => {
    const beforeLoad = await beforeLoadOf('signIn')

    await expect(
      beforeLoad(
        guardArgs({
          authenticated: true,
          search: { redirect: '/project/ada/engine?comment=c1#comment-c1' },
        }),
      ),
    ).rejects.toMatchObject({
      options: { href: '/project/ada/engine?comment=c1#comment-c1' },
    })
  })

  it('falls back to onboarding for new accounts and Home for members', async () => {
    const beforeLoad = await beforeLoadOf('signIn')

    await expect(
      beforeLoad(guardArgs({ authenticated: true, needsOnboarding: true })),
    ).rejects.toMatchObject({ options: { to: '/onboarding' } })
    await expect(
      beforeLoad(guardArgs({ authenticated: true })),
    ).rejects.toMatchObject({ options: { to: '/home' } })
  })

  it('sign-up hands the destination to sign-in', async () => {
    const beforeLoad = await beforeLoadOf('signUp')

    await expect(
      beforeLoad(
        guardArgs({ authenticated: false, search: { redirect: '/c/berlin' } }),
      ),
    ).rejects.toMatchObject({
      options: { to: '/sign-in/$', search: { redirect: '/c/berlin' } },
    })
  })
})

describe('sign-in destination from the URL', () => {
  const origin = 'https://locatic.dev'

  it('prefers our own redirect parameter', () => {
    expect(
      destinationFromAuthSearch(
        { redirect: '/explore', redirect_url: `${origin}/home` },
        origin,
      ),
    ).toBe('/explore')
  })

  it("accepts Clerk's same-origin absolute destinations as relative URLs", () => {
    expect(
      destinationFromAuthSearch(
        { redirect_url: `${origin}/project/ada/engine?post=p1#post-p1` },
        origin,
      ),
    ).toBe('/project/ada/engine?post=p1#post-p1')
    expect(
      destinationFromAuthSearch(
        { sign_in_force_redirect_url: `${origin}/c/berlin` },
        origin,
      ),
    ).toBe('/c/berlin')
  })

  it('rejects other origins, auth routes and absolute URLs without a known origin', () => {
    expect(
      destinationFromAuthSearch(
        { redirect_url: 'https://evil.example/home' },
        origin,
      ),
    ).toBeNull()
    expect(
      destinationFromAuthSearch(
        { redirect_url: `${origin}/sign-in/factor-one` },
        origin,
      ),
    ).toBeNull()
    expect(
      destinationFromAuthSearch({ redirect_url: `${origin}/home` }, null),
    ).toBeNull()
    expect(
      destinationFromAuthSearch({ redirect: '//evil.example' }, origin),
    ).toBeNull()
  })
})

describe('onboarding guard', () => {
  it('sends signed-out visitors to sign-in with the destination', async () => {
    const beforeLoad = await beforeLoadOf('onboarding')

    await expect(
      beforeLoad(
        guardArgs({ authenticated: false, search: { redirect: '/c/berlin' } }),
      ),
    ).rejects.toMatchObject({
      options: { to: '/sign-in/$', search: { redirect: '/c/berlin' } },
    })
  })

  it('sends members who already finished onboarding to the destination, else Home', async () => {
    const beforeLoad = await beforeLoadOf('onboarding')

    await expect(
      beforeLoad(
        guardArgs({ authenticated: true, search: { redirect: '/c/berlin' } }),
      ),
    ).rejects.toMatchObject({ options: { href: '/c/berlin' } })
    await expect(
      beforeLoad(guardArgs({ authenticated: true })),
    ).rejects.toMatchObject({ options: { to: '/home' } })
  })

  it('shows onboarding to members who need it', async () => {
    const beforeLoad = await beforeLoadOf('onboarding')

    await expect(
      beforeLoad(guardArgs({ authenticated: true, needsOnboarding: true })),
    ).resolves.toBeUndefined()
  })
})

describe.each([
  ['explore', '/explore?scope=custom&selectedCityIds=%5B%22c1%22%5D'],
  ['city', '/c/berlin#builders'],
])('%s guard', (route, href) => {
  it('never sends signed-out visitors through sign-in', async () => {
    const beforeLoad = await beforeLoadOf(route)

    await expect(
      beforeLoad(guardArgs({ authenticated: false, href })),
    ).resolves.toBeUndefined()
  })

  it('sends members who need onboarding there with this URL as the destination', async () => {
    const beforeLoad = await beforeLoadOf(route)

    await expect(
      beforeLoad(
        guardArgs({ authenticated: true, needsOnboarding: true, href }),
      ),
    ).rejects.toMatchObject({
      options: { to: '/onboarding', search: { redirect: href } },
    })
  })

  it('lets onboarded members through', async () => {
    const beforeLoad = await beforeLoadOf(route)

    await expect(
      beforeLoad(guardArgs({ authenticated: true, href })),
    ).resolves.toBeUndefined()
  })
})
