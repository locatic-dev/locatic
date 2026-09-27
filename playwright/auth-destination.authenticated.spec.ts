import { devices, type Page, type Route } from '@playwright/test'
import {
  currentPathname,
  personas,
  SIGNED_OUT_STATE,
  signIn,
  signInFreshContext,
} from './fixtures/personas'
import { expect, requireE2EPrerequisite, test } from './fixtures/test'

// Destination contract (plan item A6). The signed-in cases use the stored
// session of the authenticated project; signed-out cases override it with an
// empty storage state, so the whole matrix lives in one project.

// Settings validates its search back to the same string, so the comparisons
// below are exact.
const PROTECTED_DESTINATION = '/settings?tab=privacy'
const PROTECTED_DESTINATION_WITH_HASH = '/settings?tab=privacy#visibility'
const PROJECT_DESTINATION = '/project/x/y?comment=c1#comment-c1'
const ONBOARDING_USER_EMAIL = personas.onboardingEmail
const SKIP_ONBOARDING_USER_REASON =
  'needs a Clerk user that has not finished onboarding (set E2E_CLERK_ONBOARDING_USER_EMAIL)'

type RouterWindow = Window & {
  __TSR_ROUTER__?: { navigate: (options: { href: string }) => Promise<void> }
}

function signInSearch(destination: string) {
  return `?${new URLSearchParams({ redirect: destination }).toString()}`
}

function currentHref(page: Page) {
  const url = new URL(page.url())
  return `${url.pathname}${url.search}${url.hash}`
}

async function expectSignInCarrying(page: Page, destination: string | null) {
  await expect
    .poll(() => {
      const url = new URL(page.url())
      return {
        pathname: url.pathname.replace(/\/$/, ''),
        redirect: url.searchParams.get('redirect'),
      }
    })
    .toEqual({ pathname: '/sign-in', redirect: destination })
}

/** Client-side navigation through the hydrated TanStack router. */
async function clientNavigate(page: Page, href: string) {
  await page.waitForFunction(() =>
    Boolean((window as RouterWindow).__TSR_ROUTER__),
  )
  await page.evaluate(async (target) => {
    await (window as RouterWindow).__TSR_ROUTER__?.navigate({ href: target })
  }, href)
}

function recordNavigations(page: Page) {
  const visited: string[] = []
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      visited.push(new URL(frame.url()).pathname)
    }
  })
  return visited
}

async function delayRoute(route: Route, ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
  await route.continue()
}

async function requireOnboardedSession(page: Page) {
  await page.goto('/home')
  requireE2EPrerequisite(
    currentPathname(page) !== '/onboarding',
    'the populated user has not finished onboarding (playwright/fixtures/fixtures.md)',
  )
}

test.describe('signed out', () => {
  test.use({ storageState: SIGNED_OUT_STATE })

  test('direct navigation to a protected page carries it to sign-in', async ({
    page,
  }) => {
    await page.goto(PROTECTED_DESTINATION)
    await expectSignInCarrying(page, PROTECTED_DESTINATION)
  })

  test('client navigation keeps the query and hash', async ({ page }) => {
    await page.goto('/')
    await clientNavigate(page, PROTECTED_DESTINATION_WITH_HASH)
    await expectSignInCarrying(page, PROTECTED_DESTINATION_WITH_HASH)
  })

  test('refreshing sign-in keeps the destination', async ({ page }) => {
    await page.goto(PROTECTED_DESTINATION)
    await expectSignInCarrying(page, PROTECTED_DESTINATION)
    await page.reload()
    await expectSignInCarrying(page, PROTECTED_DESTINATION)
  })

  test('back navigation from sign-in returns to the public page', async ({
    page,
  }) => {
    await page.goto('/')
    await page.goto(PROTECTED_DESTINATION)
    await expectSignInCarrying(page, PROTECTED_DESTINATION)
    await page.goBack()
    await expect.poll(() => currentPathname(page)).toBe('/')
  })

  test('slow auth resolution still carries the destination', async ({
    page,
  }) => {
    await page.goto('/')
    await page.route('**/_serverFn/**', (route) => delayRoute(route, 2_000))
    await clientNavigate(page, PROTECTED_DESTINATION)
    await expectSignInCarrying(page, PROTECTED_DESTINATION)
  })

  test('sign-up keeps the destination on its way to sign-in', async ({
    page,
  }) => {
    await page.goto(`/sign-up${signInSearch(PROTECTED_DESTINATION)}`)
    await expectSignInCarrying(page, PROTECTED_DESTINATION)
  })

  test('onboarding keeps the destination on its way to sign-in', async ({
    page,
  }) => {
    await page.goto(`/onboarding${signInSearch(PROTECTED_DESTINATION)}`)
    await expectSignInCarrying(page, PROTECTED_DESTINATION)
  })

  for (const unsafe of [
    'https://evil.example/',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/onboarding',
    '/sign-in',
  ]) {
    test(`drops the unsafe destination ${JSON.stringify(unsafe)}`, async ({
      page,
    }) => {
      await page.goto(`/sign-up${signInSearch(unsafe)}`)
      await expectSignInCarrying(page, null)
    })
  }

  test('project detail stays public and never enters sign-in', async ({
    page,
  }) => {
    const visited = recordNavigations(page)
    await page.goto(PROJECT_DESTINATION)
    await expect.poll(() => currentPathname(page)).toBe('/project/x/y')
    expect(visited.some((path) => path.startsWith('/sign-in'))).toBe(false)
  })
})

test.describe('signed in', () => {
  test.beforeEach(async ({ page }) => {
    await requireOnboardedSession(page)
  })

  test('sign-in without a destination lands on Home', async ({ page }) => {
    await page.goto('/sign-in')
    await expect.poll(() => currentPathname(page)).toBe('/home')
  })

  test('sign-in honours a destination with its query and hash', async ({
    page,
  }) => {
    await page.goto(`/sign-in${signInSearch(PROJECT_DESTINATION)}`)
    await expect.poll(() => currentHref(page)).toBe(PROJECT_DESTINATION)
  })

  test('client navigation to sign-in honours the destination', async ({
    page,
  }) => {
    await clientNavigate(
      page,
      `/sign-in${signInSearch(PROTECTED_DESTINATION_WITH_HASH)}`,
    )
    await expect
      .poll(() => currentHref(page))
      .toBe(PROTECTED_DESTINATION_WITH_HASH)
  })

  test('refreshing the destination keeps it', async ({ page }) => {
    await page.goto(`/sign-in${signInSearch(PROTECTED_DESTINATION)}`)
    await expect.poll(() => currentHref(page)).toBe(PROTECTED_DESTINATION)
    await page.reload()
    await expect.poll(() => currentHref(page)).toBe(PROTECTED_DESTINATION)
  })

  test('back navigation skips the sign-in hop', async ({ page }) => {
    await page.goto(`/sign-in${signInSearch(PROTECTED_DESTINATION)}`)
    await expect.poll(() => currentHref(page)).toBe(PROTECTED_DESTINATION)
    await page.goBack()
    await expect.poll(() => currentPathname(page)).toBe('/home')
  })

  for (const unsafe of [
    'https://evil.example/',
    '//evil.example',
    '/onboarding',
  ]) {
    test(`sign-in ignores the unsafe destination ${JSON.stringify(unsafe)}`, async ({
      page,
    }) => {
      const offSite: string[] = []
      page.on('request', (request) => {
        if (
          request.isNavigationRequest() &&
          new URL(request.url()).hostname === 'evil.example'
        ) {
          offSite.push(request.url())
        }
      })
      // An open redirect fails this navigation (the host does not resolve);
      // the assertion below names it.
      await page.goto(`/sign-in${signInSearch(unsafe)}`).catch(() => {})
      expect(offSite, 'sign-in redirected off-site').toEqual([])
      await expect.poll(() => currentPathname(page)).toBe('/home')
    })
  }

  test('sign-up and onboarding forward an onboarded user to the destination', async ({
    page,
  }) => {
    await page.goto(`/sign-up${signInSearch(PROTECTED_DESTINATION)}`)
    await expect.poll(() => currentHref(page)).toBe(PROTECTED_DESTINATION)

    await page.goto(`/onboarding${signInSearch(PROTECTED_DESTINATION)}`)
    await expect.poll(() => currentHref(page)).toBe(PROTECTED_DESTINATION)

    await page.goto('/onboarding')
    await expect.poll(() => currentPathname(page)).toBe('/home')
  })

  test('slow auth in a fresh mobile context keeps Explore', async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
      ...devices['Pixel 7'],
      storageState: testInfo.project.use.storageState,
    })
    // Captures the redirect sequence and Clerk's auth verdicts for the
    // intermittent mobile Explore-to-Home bounce (investigation I5).
    await context.tracing.start({ screenshots: true, snapshots: true })
    const page = await context.newPage()
    const authVerdicts: Array<Record<string, string | number | null>> = []
    page.on('response', (response) => {
      const status = response.headers()['x-clerk-auth-status']
      if (status) {
        authVerdicts.push({
          url: response.url(),
          status: response.status(),
          authStatus: status,
          authReason: response.headers()['x-clerk-auth-reason'] ?? null,
        })
      }
    })
    const visited = recordNavigations(page)
    await page.route('**/_serverFn/**', (route) => delayRoute(route, 1_500))
    await page.route(/clerk\..*\/v1\/client/, (route) =>
      delayRoute(route, 1_500),
    )

    try {
      await page.goto('/explore')
      await expect(page.locator('main#main-content')).toBeVisible()
      requireE2EPrerequisite(
        currentPathname(page) !== '/onboarding',
        'authenticated user is still in onboarding',
      )
      // Let Clerk finish loading so a late client redirect would show up.
      await page.waitForTimeout(4_000)

      expect(currentPathname(page)).toBe('/explore')
      expect(
        visited.filter(
          (path) => path.startsWith('/sign-in') || path === '/home',
        ),
      ).toEqual([])
    } finally {
      await testInfo.attach('clerk-auth-verdicts', {
        body: JSON.stringify({ visited, authVerdicts }, null, 2),
        contentType: 'application/json',
      })
      const tracePath = testInfo.outputPath('mobile-explore-trace.zip')
      await context.tracing.stop({ path: tracePath })
      await testInfo.attach('mobile-explore-trace', {
        path: tracePath,
        contentType: 'application/zip',
      })
      await context.close()
    }
  })
})

test.describe('signing in from a destination', () => {
  test('returns to the project URL with its query and hash', async ({
    browser,
  }) => {
    const emailAddress = personas.populatedEmail
    requireE2EPrerequisite(
      Boolean(emailAddress),
      'E2E_CLERK_USER_EMAIL is required',
    )

    const context = await browser.newContext({
      storageState: SIGNED_OUT_STATE,
    })
    const page = await context.newPage()

    try {
      await page.goto(PROJECT_DESTINATION)
      await page.goto(`/sign-in${signInSearch(PROJECT_DESTINATION)}`)
      await signIn(page, emailAddress!)
      // The signed-in sign-in route resolves the destination on the next load.
      await page.reload()
      await expect.poll(() => currentHref(page)).toBe(PROJECT_DESTINATION)
    } finally {
      await context.close()
    }
  })
})

test.describe('onboarding required', () => {
  test('a protected destination is carried into onboarding', async ({
    browser,
  }) => {
    requireE2EPrerequisite(
      Boolean(ONBOARDING_USER_EMAIL),
      SKIP_ONBOARDING_USER_REASON,
    )
    const { context, page } = await signInFreshContext(
      browser,
      ONBOARDING_USER_EMAIL!,
    )

    try {
      await page.goto(PROTECTED_DESTINATION)
      await expect
        .poll(() => {
          const url = new URL(page.url())
          return [url.pathname, url.searchParams.get('redirect')]
        })
        .toEqual(['/onboarding', PROTECTED_DESTINATION])
    } finally {
      await context.close()
    }
  })

  test('Home and sign-in send a new user to onboarding without a destination', async ({
    browser,
  }) => {
    requireE2EPrerequisite(
      Boolean(ONBOARDING_USER_EMAIL),
      SKIP_ONBOARDING_USER_REASON,
    )
    const { context, page } = await signInFreshContext(
      browser,
      ONBOARDING_USER_EMAIL!,
    )

    try {
      for (const entry of ['/home', '/sign-in']) {
        await page.goto(entry)
        await expect
          .poll(() => {
            const url = new URL(page.url())
            return [url.pathname, url.searchParams.get('redirect')]
          })
          .toEqual(['/onboarding', null])
      }
    } finally {
      await context.close()
    }
  })

  test('finishing onboarding opens the preserved destination, else Explore', async () => {
    requireE2EPrerequisite(
      false,
      'finishing onboarding is one-way; needs a resettable not-yet-onboarded Clerk and Convex user fixture (A1)',
    )
  })
})
