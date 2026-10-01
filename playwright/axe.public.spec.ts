import { expectNoSeriousA11yViolations } from './axe'
import { settledBuilderRows } from './fixtures/explore'
import { personas } from './fixtures/personas'
import {
  expect,
  expectNoPendingContent,
  expectSettled,
  requireE2EPrerequisite,
  test,
} from './fixtures/test'

// Axe on every public route (plan item E3), signed out. Fails on critical and
// serious WCAG A/AA violations. Routes that need persona data
// (playwright/fixtures/fixtures.md) fail release validation when it is missing.

const PROFILE_USERNAME = personas.publicProfileUsername

// Clerk renders the sign-in form; the app cannot change its markup.
const CLERK_WIDGET = '.cl-rootBox'

const STATIC_ROUTES: Array<{ name: string; path: string; exclude?: string[] }> =
  [
    { name: 'landing', path: '/' },
    { name: 'explore projects', path: '/explore' },
    { name: 'explore builders', path: '/explore?mode=builders&scope=global' },
    { name: 'explore posts', path: '/explore?mode=posts&scope=global' },
    { name: 'privacy', path: '/privacy' },
    { name: 'terms', path: '/terms' },
    { name: 'sign in', path: '/sign-in', exclude: [CLERK_WIDGET] },
    { name: 'unknown city', path: '/c/atlantis-nowhere' },
    { name: 'not found', path: '/this-route-does-not-exist' },
  ]

test.describe('axe: public routes', () => {
  for (const route of STATIC_ROUTES) {
    test(`${route.name} has no critical or serious violations`, async ({
      page,
    }) => {
      await page.goto(route.path)
      await expectSettled(page, page.locator('main').first())
      await expectNoPendingContent(page)
      await expectNoSeriousA11yViolations(page, { exclude: route.exclude })
    })
  }

  test('explore filter sheet at 390px has no critical or serious violations', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/explore?scope=global')
    const heading = page.getByRole('heading', { level: 1, name: 'explore' })
    await expectSettled(page, heading)
    await expectNoPendingContent(page)
    await page
      .locator('header', { has: heading })
      .getByRole('button', { name: /^filters/ })
      .click()
    await expect(page.getByRole('dialog', { name: 'filters' })).toBeVisible()
    await expectNoSeriousA11yViolations(page)
  })

  test('public profile has no critical or serious violations', async ({
    page,
  }) => {
    requireE2EPrerequisite(
      Boolean(PROFILE_USERNAME),
      'set E2E_PUBLIC_PROFILE_USERNAME to a public profile (see playwright/fixtures/fixtures.md)',
    )
    await page.goto(`/u/${PROFILE_USERNAME}`)
    await expectSettled(page, page.getByRole('heading', { level: 1 }))
    await expectNoPendingContent(page)
    await expectNoSeriousA11yViolations(page)
  })

  test('project page has no critical or serious violations', async ({
    page,
  }) => {
    requireE2EPrerequisite(
      Boolean(PROFILE_USERNAME),
      'set E2E_PUBLIC_PROFILE_USERNAME to a public profile with a visible project (see playwright/fixtures/fixtures.md)',
    )
    await page.goto(`/u/${PROFILE_USERNAME}`)
    await expectSettled(page, page.getByRole('heading', { level: 1 }))
    await expectNoPendingContent(page)
    const projectLink = page.locator('main a[href^="/project/"]').first()
    requireE2EPrerequisite(
      (await projectLink.count()) > 0,
      'needs a visible project on the public profile (populated persona)',
    )
    await page.goto((await projectLink.getAttribute('href')) ?? '/')
    await expectSettled(page, page.getByRole('heading', { level: 1 }))
    await expectNoPendingContent(page)
    await expectNoSeriousA11yViolations(page)
  })

  test('city page has no critical or serious violations', async ({ page }) => {
    await page.goto('/explore?mode=builders&scope=global')
    await settledBuilderRows(page)
    const cityLink = page.locator('main a[title$=" city page"]').first()
    requireE2EPrerequisite(
      (await cityLink.count()) > 0,
      'needs an exact-city builder (populated persona)',
    )
    await cityLink.click()
    await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/c\//)
    await expectSettled(page, page.getByRole('heading', { level: 1 }))
    await expectNoPendingContent(page)
    await expectNoSeriousA11yViolations(page)
  })
})
