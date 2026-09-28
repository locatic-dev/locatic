import type { Page } from '@playwright/test'
import {
  gotoRetryingAbort,
  personas,
  SIGNED_OUT_STATE,
  signIn,
  requireOnboardedPersona,
} from './fixtures/personas'
import {
  expect,
  expectSettled,
  requireE2EPrerequisite,
  test,
} from './fixtures/test'

// Empty-city persona (playwright/fixtures/fixtures.md, plan items C2, C10): an
// onboarded exact-city member of a city with no other builders or projects.

function exploreScope(page: Page) {
  const url = new URL(page.url())
  return {
    scope: url.searchParams.get('scope'),
    selectedCityIds: url.searchParams.get('selectedCityIds'),
  }
}

async function openExploreHeader(page: Page) {
  const heading = page.getByRole('heading', { level: 1, name: 'explore' })
  await expectSettled(page, heading)
  const header = page.locator('header', { has: heading })
  const cityInput = header.getByRole('combobox', { name: 'Add a city filter' })
  const pickCity = async (name: string) => {
    await cityInput.fill(name)
    await header
      .getByRole('listbox', { name: 'Add a city filter' })
      .getByRole('option', { name: new RegExp(`^${name}\\b`, 'i') })
      .first()
      .click()
  }
  return { cityInput, pickCity }
}

test.describe('empty selected city', () => {
  test.use({ storageState: SIGNED_OUT_STATE })

  test.beforeEach(async ({ page }) => {
    requireE2EPrerequisite(
      Boolean(personas.emptyCityEmail),
      'needs the empty-city persona (set E2E_CLERK_EMPTY_CITY_USER_EMAIL)',
    )
    await page.goto('/')
    await signIn(page, personas.emptyCityEmail!)
    await gotoRetryingAbort(page, '/explore?scope=global')
    requireOnboardedPersona(page, 'the empty-city user')
  })

  test('names the city, counts its builders and changes scope only on click', async ({
    page,
  }) => {
    const { cityInput, pickCity } = await openExploreHeader(page)
    await pickCity(personas.emptyCityName)

    await expectSettled(
      page,
      page.getByRole('heading', {
        name: `no projects in ${personas.emptyCityName} yet.`,
      }),
    )
    await expect(page.getByText(/^\d[\d,]* builders? here$/)).toBeVisible()
    const scopeBefore = exploreScope(page)
    expect(scopeBefore.scope).toBe('custom')

    // Nothing moves on its own.
    await page.waitForTimeout(1_500)
    expect(exploreScope(page)).toEqual(scopeBefore)

    await page.getByRole('button', { name: 'choose another city' }).click()
    await expect(cityInput).toBeFocused()
    expect(exploreScope(page)).toEqual(scopeBefore)

    await page.getByRole('button', { name: 'browse everywhere' }).click()
    await expect.poll(() => exploreScope(page).scope).toBe('global')
  })

  test('choose another city adds it and leaves the empty-city state', async ({
    page,
  }) => {
    const { cityInput, pickCity } = await openExploreHeader(page)
    await pickCity(personas.emptyCityName)
    const emptyHeading = page.getByRole('heading', {
      name: `no projects in ${personas.emptyCityName} yet.`,
    })
    await expectSettled(page, emptyHeading)
    const emptyCityIds = exploreScope(page).selectedCityIds

    await page.getByRole('button', { name: 'choose another city' }).click()
    await expect(cityInput).toBeFocused()
    await pickCity(personas.otherCityName)

    await expect
      .poll(() => exploreScope(page).selectedCityIds)
      .not.toBe(emptyCityIds)
    expect(exploreScope(page).scope).toBe('custom')
    await expect(emptyHeading).toHaveCount(0)
    await expect(
      page.getByRole('button', {
        name: new RegExp(`^Remove ${personas.otherCityName}\\b`, 'i'),
      }),
    ).toBeVisible()
  })
})
