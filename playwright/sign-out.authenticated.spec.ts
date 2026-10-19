import { type Page } from '@playwright/test'
import {
  personas,
  requireOnboardedPersona,
  signInFreshContext,
} from './fixtures/personas'
import {
  expect,
  expectNoPendingContent,
  expectSettled,
  requireE2EPrerequisite,
  test,
} from './fixtures/test'

async function observeTransition(page: Page) {
  const states: string[] = []
  await page.exposeFunction('recordSignOutText', (text: string) =>
    states.push(text),
  )
  await page.evaluate(() => {
    const record = () => {
      void (
        window as Window & {
          recordSignOutText?: (text: string) => Promise<void>
        }
      ).recordSignOutText?.(document.body.innerText)
    }
    new MutationObserver(record).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  })
  return states
}

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile profile' : 'desktop menu'} sign-out goes straight through progress to landing`, async ({
    browser,
  }) => {
    requireE2EPrerequisite(
      Boolean(personas.populatedEmail),
      'needs E2E_CLERK_USER_EMAIL (playwright/fixtures/fixtures.md)',
    )
    // A fresh session keeps this test from revoking the suite's stored session.
    const { context, page } = await signInFreshContext(
      browser,
      personas.populatedEmail!,
    )
    try {
      await page.setViewportSize(
        mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      )
      await page.goto(mobile ? '/profile' : '/home')
      requireOnboardedPersona(page)
      await expectSettled(page, page.getByRole('heading', { level: 1 }).first())
      await expectNoPendingContent(page)
      if (!mobile)
        await page.getByRole('button', { name: 'Account menu' }).click()
      const states = await observeTransition(page)
      await page
        .getByRole(mobile ? 'button' : 'menuitem', {
          name: 'sign out',
          exact: true,
        })
        .click()
      await expect(page).toHaveURL(/\/$/)
      await expect(
        page.getByRole('heading', { level: 1, name: 'github, with a map.' }),
      ).toBeVisible()
      expect(states.some((text) => text.includes('signing out…'))).toBe(true)
      expect(
        states.some(
          (text) =>
            text.includes("you're not following anyone yet.") ||
            text.includes("couldn't load your feed.") ||
            text.includes('sign in again'),
        ),
      ).toBe(false)
      await expect(
        page.getByRole('link', { name: 'sign in', exact: true }),
      ).toBeVisible()

      // Follow an actual public project after logout; the visitor outlet must
      // remain usable without the member shell or an authentication redirect.
      const project = page
        .getByRole('link', { name: / shipped | shared / })
        .first()
      const href = await project.getAttribute('href')
      requireE2EPrerequisite(
        Boolean(href?.startsWith('/project/')),
        'landing needs a visible public project',
      )
      await page.goto(href!)
      await expectSettled(page, page.getByRole('heading', { level: 1 }).first())
      await expectNoPendingContent(page)
      await expect(page).toHaveURL(/\/project\//)
      await expect(
        page.getByRole('button', { name: 'Account menu' }),
      ).toHaveCount(0)
    } finally {
      await context.close()
    }
  })
}

test('sign-out in another tab redirects an already-mounted private page without a redirect loop', async ({
  browser,
}) => {
  requireE2EPrerequisite(
    Boolean(personas.populatedEmail),
    'needs E2E_CLERK_USER_EMAIL (playwright/fixtures/fixtures.md)',
  )
  const { context, page } = await signInFreshContext(
    browser,
    personas.populatedEmail!,
  )
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.goto('/home')
    requireOnboardedPersona(page)
    await expectSettled(
      page,
      page.getByRole('heading', { level: 1, name: 'home' }),
    )
    await expectNoPendingContent(page)
    const otherTab = await context.newPage()
    await otherTab.goto('/home')
    await expectNoPendingContent(otherTab)
    await otherTab.getByRole('button', { name: 'Account menu' }).click()
    await otherTab
      .getByRole('menuitem', { name: 'sign out', exact: true })
      .click()
    await expect(otherTab).toHaveURL(/\/$/)
    // Clerk may normalize its multi-step path after pinning the destination.
    await expect(page).toHaveURL(/\/sign-in(?:\?|$)/)
    await expect(
      page.getByRole('button', { name: 'Continue with GitHub' }),
    ).toBeVisible()
    expect(errors).toEqual([])
  } finally {
    await context.close()
  }
})
