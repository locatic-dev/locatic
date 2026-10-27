import type { Locator, Page } from '@playwright/test'
import { requireOnboardedPersona } from './fixtures/personas'
import {
  expect,
  expectNoPendingContent,
  expectSettled,
  requireE2EPrerequisite,
  test,
} from './fixtures/test'
import { BASELINE_VIEWPORTS, expectBaseline } from './fixtures/visual'

// Screenshot baselines for every signed-in route at 1440 and 390,
// as the populated user. Live content (times, graphs, maps) is masked;
// see fixtures/visual.ts.

const ROUTES: Array<{ name: string; path: string; title: string }> = [
  { name: 'home', path: '/home', title: 'home' },
  { name: 'explore-signed-in', path: '/explore', title: 'explore' },
  { name: 'inbox', path: '/inbox?tab=inbox', title: 'inbox' },
  { name: 'notifications', path: '/notifications', title: 'notifications' },
  { name: 'saved', path: '/saved', title: 'saved' },
  { name: 'settings', path: '/settings?tab=account', title: 'settings' },
]

function pageTitle(page: Page, title: string): Locator {
  return page.getByRole('heading', { level: 1, name: title })
}

async function requirePopulatedVisualRoute(page: Page, name: string) {
  await expectNoPendingContent(page)
  const main = page.locator('main#main-content')
  let requiredContent: Locator | undefined
  switch (name) {
    case 'home':
      requiredContent = main.locator('article').first()
      break
    case 'explore-signed-in':
      requiredContent = main.locator('a[href^="/project/"]').first()
      break
    case 'inbox':
      requiredContent = main
        .getByRole('button', { name: /^open conversation with/i })
        .first()
      break
    case 'notifications':
      requiredContent = main
        .getByRole('button')
        .filter({ has: page.locator('p') })
        .first()
      break
  }
  if (requiredContent) {
    requireE2EPrerequisite(
      (await requiredContent.count()) > 0,
      `${name} needs the populated persona data described in playwright/fixtures/fixtures.md`,
    )
  }
}

for (const viewport of BASELINE_VIEWPORTS) {
  test.describe(`signed-in baselines at ${viewport.width}px`, () => {
    test.use({ viewport })

    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
    })

    for (const route of ROUTES) {
      test(route.name, async ({ page }) => {
        await page.goto(route.path)
        requireOnboardedPersona(page)
        await expectSettled(page, pageTitle(page, route.title))
        await requirePopulatedVisualRoute(page, route.name)
        await expectBaseline(page, route.name)
      })
    }

    test('own profile', async ({ page }) => {
      await page.goto('/profile')
      requireOnboardedPersona(page)
      await expectSettled(page, page.getByRole('heading', { level: 1 }))
      await expectNoPendingContent(page)
      requireE2EPrerequisite(
        (await page.locator('main a[href^="/project/"]').count()) > 0,
        'the populated user needs a visible project before capturing the profile baseline (playwright/fixtures/fixtures.md)',
      )
      await expectBaseline(page, 'own-profile')
    })

    test('own project', async ({ page }) => {
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
      await expectBaseline(page, 'own-project')
    })
  })
}
