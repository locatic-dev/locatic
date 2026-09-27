import { expectNoSeriousA11yViolations } from './axe'
import { requireOnboardedPersona } from './fixtures/personas'
import {
  expect,
  expectNoPendingContent,
  expectSettled,
  requireE2EPrerequisite,
  test,
} from './fixtures/test'

// Axe on every signed-in route (plan items E3, C10), as the populated user.
// Fails on critical and serious WCAG A/AA violations; see axe.ts.

const ROUTES: Array<{ path: string; title: string }> = [
  { path: '/home', title: 'home' },
  { path: '/explore', title: 'explore' },
  { path: '/explore?mode=builders', title: 'explore' },
  { path: '/inbox?tab=inbox', title: 'inbox' },
  { path: '/inbox?tab=requests', title: 'inbox' },
  { path: '/notifications', title: 'notifications' },
  { path: '/saved', title: 'saved' },
  { path: '/settings?tab=account', title: 'settings' },
  { path: '/settings?tab=privacy', title: 'settings' },
  { path: '/settings?tab=notifications', title: 'settings' },
  { path: '/settings?tab=connected', title: 'settings' },
  { path: '/settings?tab=danger', title: 'settings' },
]

test.describe('axe: signed-in routes', () => {
  for (const route of ROUTES) {
    test(`${route.path} has no critical or serious violations`, async ({
      page,
    }) => {
      await page.goto(route.path)
      requireOnboardedPersona(page)
      await expectSettled(
        page,
        page.getByRole('heading', { level: 1, name: route.title }),
      )
      await expectNoPendingContent(page)
      await expectNoSeriousA11yViolations(page)
    })
  }

  test('own profile has no critical or serious violations', async ({
    page,
  }) => {
    await page.goto('/profile')
    requireOnboardedPersona(page)
    await expectSettled(page, page.getByRole('heading', { level: 1 }))
    await expectNoPendingContent(page)
    await expectNoSeriousA11yViolations(page)
  })

  test('own project page has no critical or serious violations', async ({
    page,
  }) => {
    await page.goto('/profile')
    requireOnboardedPersona(page)
    await expectSettled(page, page.getByRole('heading', { level: 1 }))
    await expectNoPendingContent(page)
    const projectLink = page.locator('main a[href^="/project/"]').first()
    requireE2EPrerequisite(
      (await projectLink.count()) > 0,
      'the populated user needs a visible project (playwright/fixtures/fixtures.md)',
    )
    // A client navigation: a fresh document load here races Clerk's dev
    // handshake reload and aborts.
    await projectLink.click()
    await expect(page).toHaveURL(/\/project\//)
    await expectSettled(page, page.getByRole('heading', { level: 1 }).first())
    await expectNoPendingContent(page)
    await expectNoSeriousA11yViolations(page)
  })
})
