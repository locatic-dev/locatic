import type { Page } from '@playwright/test'
import { requireOnboardedPersona } from './fixtures/personas'
import { expect, expectSettled, test } from './fixtures/test'

const MOBILE = { width: 390, height: 844 }
// Any prefix the city catalogue answers with at least one row (Berlin, Bern).
const CITY_QUERY = 'ber'

async function openExplore(page: Page, viewport = MOBILE) {
  await page.setViewportSize(viewport)
  await page.goto('/explore')
  requireOnboardedPersona(page)

  const heading = page.getByRole('heading', { level: 1, name: 'explore' })
  await expectSettled(page, heading)
  const header = page.locator('header', { has: heading })

  return {
    header,
    cityInput: header.getByRole('combobox', { name: 'Add a city filter' }),
    cityList: header.getByRole('listbox', { name: 'Add a city filter' }),
  }
}

test('explore header stays one compact band at 390x844', async ({ page }) => {
  const { header } = await openExplore(page)

  const box = await header.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.height).toBeLessThan(MOBILE.height * 0.35)

  const reset = header.getByRole('button', { name: 'reset' })
  if ((await reset.count()) > 0) {
    // One line box means the label did not wrap ("rese/t").
    const lineCount = await reset.evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return range.getClientRects().length
    })
    expect(lineCount).toBe(1)
  }
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
  const { cityInput, cityList } = await openExplore(page, {
    width: 1280,
    height: 800,
  })

  await cityInput.fill(CITY_QUERY)
  await expect(cityList).toBeVisible()

  const box = await cityList.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThanOrEqual(320)
})
