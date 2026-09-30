import { expectNoSeriousA11yViolations } from './axe'
import {
  expect,
  expectNoPendingContent,
  expectSettled,
  requireE2EPrerequisite,
  test,
} from './fixtures/test'

// Explore's rail (at xl) and filter sheet (below xl), signed out. The same
// sections render in both; personal actions are sign-in links. "active
// builders" (the global scope's name for "active nearby") needs public
// builders (populated persona, fixtures.md).

const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const SECTIONS = ['city', 'filters', 'active builders']

test('the rail shows city, filters and active builders, with sign-in follows', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP)
  await page.goto('/explore?scope=global')
  const rail = page.getByRole('complementary', { name: 'explore filters' })
  await expectSettled(page, rail.getByRole('heading', { name: 'city' }))
  await expectNoPendingContent(page)

  const builders = rail.getByRole('heading', { name: 'active builders' })
  requireE2EPrerequisite(
    (await builders.count()) > 0,
    'needs public builders for "active builders" (playwright/fixtures/fixtures.md)',
  )
  for (const name of SECTIONS) {
    await expect(
      rail.getByRole('heading', { level: 2, name, exact: true }),
    ).toBeVisible()
  }
  await expect(
    rail.getByRole('link', { name: /^Sign in to follow / }).first(),
  ).toBeVisible()
  await expect(rail.getByRole('button', { name: /^follow/ })).toHaveCount(0)
})

test('below xl, filters opens the same sections in a dialog that Escape closes', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await page.goto('/explore?scope=global')
  const heading = page.getByRole('heading', { level: 1, name: 'explore' })
  await expectSettled(page, heading)
  await expectNoPendingContent(page)
  await expect(
    page.getByRole('complementary', { name: 'explore filters' }),
  ).toBeHidden()

  const filters = page
    .locator('header', { has: heading })
    .getByRole('button', { name: /^filters/ })
  await expect(filters).toHaveAttribute('aria-expanded', 'false')
  await filters.click()
  const sheet = page.getByRole('dialog', { name: 'explore filters' })
  await expect(sheet).toBeVisible()
  // The sheet's title (h2) names the dialog; the sections are h3 below it.
  await expect(
    sheet.getByRole('heading', { level: 2, name: 'explore filters' }),
  ).toBeVisible()
  for (const name of ['city', 'filters']) {
    await expect(
      sheet.getByRole('heading', { level: 3, name, exact: true }),
    ).toBeVisible()
  }
  await expect(
    sheet.getByRole('combobox', { name: 'Add a city filter' }),
  ).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(filters).toBeFocused()
})
