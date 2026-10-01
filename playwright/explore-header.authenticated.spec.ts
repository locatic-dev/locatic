import type { Page } from '@playwright/test'
import { requireOnboardedPersona } from './fixtures/personas'
import { expect, expectSettled, test } from './fixtures/test'

const MOBILE = { width: 390, height: 844 }
// Desktop Chrome's 1280px sits exactly on `xl`, where the rail appears.
const DESKTOP = { width: 1440, height: 900 }
// Any prefix the city catalogue answers with at least one row (Berlin, Bern).
const CITY_QUERY = 'ber'

/**
 * Opens Explore and returns the city controls: in the rail at 1440px, in the
 * filter sheet (opened from the header's "filters" button) at 390px.
 */
async function openExplore(page: Page, viewport = MOBILE) {
  await page.setViewportSize(viewport)
  await page.goto('/explore')
  requireOnboardedPersona(page)

  const heading = page.getByRole('heading', { level: 1, name: 'explore' })
  await expectSettled(page, heading)
  const header = page.locator('header', { has: heading })

  if (viewport.width < DESKTOP.width) {
    await header.getByRole('button', { name: /^filters/ }).click()
  }
  const controls =
    viewport.width < DESKTOP.width
      ? page.getByRole('dialog', { name: 'explore filters' })
      : page.getByRole('complementary', { name: 'explore filters' })

  return {
    cityInput: controls.getByRole('combobox', { name: 'Add a city filter' }),
    cityList: controls.getByRole('listbox', { name: 'Add a city filter' }),
  }
}

test('explore header stays one compact band at 390x844', async ({ page }) => {
  await page.setViewportSize(MOBILE)
  await page.goto('/explore')
  requireOnboardedPersona(page)
  const heading = page.getByRole('heading', { level: 1, name: 'explore' })
  await expectSettled(page, heading)
  const header = page.locator('header', { has: heading })

  const box = await header.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.height).toBeLessThan(MOBILE.height * 0.35)

  // Reset moved to the filter sheet as "reset dismissed".
  await expect(header.getByRole('button', { name: /reset/ })).toHaveCount(0)
  await header.getByRole('button', { name: /^filters/ }).click()
  const reset = page
    .getByRole('dialog', { name: 'explore filters' })
    .getByRole('button', { name: 'reset dismissed' })
  await expect(reset).toBeVisible()
  // One line box means the label did not wrap.
  const lineCount = await reset.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    return range.getClientRects().length
  })
  expect(lineCount).toBe(1)
})

test('city combobox marks the active option with the selected bar and closes on blur', async ({
  page,
}) => {
  const { cityInput, cityList } = await openExplore(page)

  await cityInput.fill(CITY_QUERY)
  await expect(cityList).toBeVisible()

  await cityInput.press('ArrowDown')
  const active = cityList.getByRole('option', { selected: true })
  await expect(active).toHaveCount(1)
  await expect(cityInput).toHaveAttribute(
    'aria-activedescendant',
    (await active.getAttribute('id')) ?? '',
  )

  const bar = await active.evaluate((element) => {
    const style = getComputedStyle(element, '::before')
    return { color: style.backgroundColor, width: parseFloat(style.width) }
  })
  expect(bar.width).toBeGreaterThanOrEqual(2)
  expect(bar.color).not.toBe('rgba(0, 0, 0, 0)')

  await cityInput.press('Tab')
  await expect(cityList).toBeHidden()
  await expect(cityInput).toHaveAttribute('aria-expanded', 'false')
})

test('city combobox list is at least 320px wide on desktop', async ({
  page,
}) => {
  const { cityInput, cityList } = await openExplore(page, DESKTOP)

  await cityInput.fill(CITY_QUERY)
  await expect(cityList).toBeVisible()

  const box = await cityList.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThanOrEqual(320)
})
