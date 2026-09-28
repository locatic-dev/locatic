import type { Locator, Page } from '@playwright/test'
import { settledBuilderRows, settledProjectFeed } from './fixtures/explore'
import { personas } from './fixtures/personas'
import {
  expect,
  expectSettled,
  requireE2EPrerequisite,
  test,
} from './fixtures/test'
import { BASELINE_VIEWPORTS, expectBaseline } from './fixtures/visual'

// Screenshot baselines for every public route at 1440 and 390 (plan item
// C10), signed out. Live content (times, graphs, maps) is masked; see
// fixtures/visual.ts. Persona data is required by release validation.

// Clerk renders the sign-in form; its markup is not the app's.
const CLERK_WIDGET = '.cl-rootBox'

const STATIC_ROUTES: Array<{
  name: string
  path: string
  ready: (page: Page) => Locator
  mask?: string[]
}> = [
  {
    name: 'landing',
    path: '/',
    ready: (page) => page.getByRole('heading', { level: 1 }),
  },
  {
    name: 'privacy',
    path: '/privacy',
    ready: (page) => page.getByRole('heading', { level: 1 }),
  },
  {
    name: 'terms',
    path: '/terms',
    ready: (page) => page.getByRole('heading', { level: 1 }),
  },
  {
    name: 'sign-in',
    path: '/sign-in',
    ready: (page) => page.getByRole('main'),
    mask: [CLERK_WIDGET],
  },
  {
    name: 'not-found',
    path: '/this-route-does-not-exist',
    ready: (page) => page.getByRole('heading', { level: 1 }),
  },
  {
    name: 'city-not-found',
    path: '/c/atlantis-nowhere',
    ready: (page) =>
      page.getByRole('heading', { level: 1, name: 'city not found' }),
  },
  {
    name: 'builder-not-found',
    path: '/u/no-such-builder-e2e-404',
    ready: (page) =>
      page.getByRole('heading', { level: 1, name: 'builder not found' }),
  },
]

for (const viewport of BASELINE_VIEWPORTS) {
  test.describe(`public baselines at ${viewport.width}px`, () => {
    test.use({ viewport })

    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
    })

    for (const route of STATIC_ROUTES) {
      test(route.name, async ({ page }) => {
        await page.goto(route.path)
        await expectSettled(page, route.ready(page))
        await expectBaseline(page, route.name, { mask: route.mask })
      })
    }

    test('explore', async ({ page }) => {
      await page.goto('/explore?scope=global')
      await settledProjectFeed(page)
      await expectBaseline(page, 'explore')
    })

    test('explore builders', async ({ page }) => {
      await page.goto('/explore?mode=builders&scope=global')
      await settledBuilderRows(page)
      await expectBaseline(page, 'explore-builders')
    })

    test('public profile', async ({ page }) => {
      requireE2EPrerequisite(
        Boolean(personas.publicProfileUsername),
        'set E2E_PUBLIC_PROFILE_USERNAME (playwright/fixtures/fixtures.md)',
      )
      await page.goto(`/u/${personas.publicProfileUsername}`)
      await expectSettled(page, page.getByRole('heading', { level: 1 }))
      await expectBaseline(page, 'profile')
    })

    test('project page', async ({ page }) => {
      requireE2EPrerequisite(
        Boolean(personas.publicProfileUsername),
        'set E2E_PUBLIC_PROFILE_USERNAME to a profile with a visible project (fixtures.md)',
      )
      await page.goto(`/u/${personas.publicProfileUsername}`)
      await expectSettled(page, page.getByRole('heading', { level: 1 }))
      const projectLink = page.locator('main a[href^="/project/"]').first()
      requireE2EPrerequisite(
        (await projectLink.count()) > 0,
        'needs a visible project on the public profile (populated persona)',
      )
      await page.goto((await projectLink.getAttribute('href')) ?? '/')
      await expectSettled(page, page.getByRole('heading', { level: 1 }))
      await expectBaseline(page, 'project')
    })

    test('city page', async ({ page }) => {
      await page.goto('/explore?mode=builders&scope=global')
      await settledBuilderRows(page)
      const cityLink = page.locator('main a[title$=" city page"]').first()
      requireE2EPrerequisite(
        (await cityLink.count()) > 0,
        'needs an exact-city builder (populated persona)',
      )
      await cityLink.click()
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toMatch(/^\/c\/[a-z0-9-]+$/)
      await expectSettled(page, page.getByRole('heading', { level: 1 }))
      await expectBaseline(page, 'city')
    })
  })
}
