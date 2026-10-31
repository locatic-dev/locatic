import { createClerkClient } from '@clerk/backend'
import { isClerkAPIResponseError } from '@clerk/backend/errors'
import {
  personas,
  requireOnboardedPersona,
  SIGNED_OUT_STATE,
  signInFreshContext,
} from './fixtures/personas'
import {
  expect,
  expectSettled,
  requireE2EPrerequisite,
  test,
} from './fixtures/test'

// A fresh context avoids revoking the reusable suite session. The old cookie
// remains in memory only and is replayed solely to the same test app.
test.use({ storageState: SIGNED_OUT_STATE })

test('a signed-out session with an unexpired cookie redirects private requests to sign-in', async ({
  browser,
}) => {
  requireE2EPrerequisite(
    Boolean(personas.populatedEmail && process.env.CLERK_SECRET_KEY),
    'needs E2E_CLERK_USER_EMAIL and CLERK_SECRET_KEY (playwright/fixtures/fixtures.md)',
  )
  const { context, page } = await signInFreshContext(
    browser,
    personas.populatedEmail!,
  )
  try {
    await page.goto('/home')
    requireOnboardedPersona(page)
    await expectSettled(
      page,
      page.getByRole('heading', { name: 'home', exact: true }),
    )
    const origin = new URL(page.url()).origin
    const oldCookies = await context.cookies(origin)
    await page
      .getByRole('button', { name: 'Account menu', exact: true })
      .click()
    await page.getByRole('menuitem', { name: 'sign out', exact: true }).click()
    await expect(page).toHaveURL(origin + '/')

    const sessionCookie = oldCookies.find(
      (cookie) => cookie.name === '__session',
    )
    // Boolean assertions keep credentials out of failure output.
    expect(Boolean(sessionCookie)).toBe(true)
    const claims = JSON.parse(
      Buffer.from(sessionCookie!.value.split('.')[1], 'base64url').toString(
        'utf8',
      ),
    ) as { exp: number; sid: string }
    expect(claims.exp * 1000 > Date.now()).toBe(true)
    let sessionStatus: string
    try {
      sessionStatus = (
        await createClerkClient({
          secretKey: process.env.CLERK_SECRET_KEY,
        }).sessions.getSession(claims.sid)
      ).status
    } catch (error) {
      if (
        isClerkAPIResponseError(error) &&
        error.status === 404 &&
        error.errors.some((item) => item.code === 'resource_not_found')
      ) {
        sessionStatus = 'missing'
      } else {
        throw error
      }
    }
    expect(sessionStatus).not.toBe('active')

    // Model requests already in flight when Clerk revokes the session.
    for (const destination of ['/inbox', '/settings?tab=account']) {
      const response = await context.request.get(origin + destination, {
        headers: {
          cookie: oldCookies
            .map((cookie) => `${cookie.name}=${cookie.value}`)
            .join('; '),
        },
        maxRedirects: 0,
      })
      expect(response.status()).toBe(307)
      const location = new URL(response.headers().location, origin)
      expect(location.pathname).toBe('/sign-in')
      expect(location.searchParams.get('redirect')).toBe(destination)
    }
    // Expired-cookie redirects must not satisfy the stale-session regression.
    expect(claims.exp * 1000 > Date.now()).toBe(true)

    // Also verify that browser re-entry renders the login UI, not an error page.
    await context.addCookies(oldCookies)
    await page.goto('/inbox')
    await expect(page).toHaveURL(/\/sign-in\?redirect=%2Finbox$/)
    await expectSettled(
      page,
      page.getByRole('button', { name: 'Continue with GitHub' }),
    )
    await expect(
      page.getByRole('button', { name: 'Account menu' }),
    ).toHaveCount(0)
  } finally {
    await context.close()
  }
})
