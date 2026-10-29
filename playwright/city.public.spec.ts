import { settledBuilderRows } from './fixtures/explore'
import {
  expect,
  expectSettled,
  requireE2EPrerequisite,
  test,
} from './fixtures/test'

// Public city pages. Signed-out visitors reach a city page from
// a city pill and a builder profile from the city page; unknown cities are a
// real 404. Data comes from the populated persona's city
// (playwright/fixtures/fixtures.md). The landing page does not link to city
// pages yet, so the journey starts on public Explore.

function pathname(url: string) {
  return new URL(url).pathname.replace(/(.)\/$/, '$1')
}

test.describe('public city page', () => {
  test('an unknown city is a 404 with a way back to Explore', async ({
    page,
  }) => {
    const response = await page.goto('/c/atlantis-nowhere')
    expect(response?.status()).toBe(404)
    await expect(
      page.getByRole('heading', { level: 1, name: 'city not found' }),
    ).toBeVisible()
    await page.getByRole('link', { name: 'go to explore' }).click()
    await expect.poll(() => pathname(page.url())).toBe('/explore')
  })

  test('visitor goes from a city pill to the city page and on to a builder', async ({
    page,
  }) => {
    await page.goto('/explore?mode=builders&scope=global')
    await settledBuilderRows(page)
    const cityLink = page.locator('main a[title$=" city page"]').first()
    requireE2EPrerequisite(
      (await cityLink.count()) > 0,
      'needs an exact-city builder in the deployment (populated persona, playwright/fixtures/fixtures.md)',
    )

    await cityLink.click()
    // The pill links by slug (or by id, which redirects to the slug).
    await expect.poll(() => pathname(page.url())).toMatch(/^\/c\/[a-z0-9-]+$/)
    await expectSettled(page, page.getByRole('heading', { level: 1 }))
    // The header summarises the city in a sentence.
    await expect(
      page.getByText(
        /^\d+ builders? in .+ shares? \d+ public projects? on Locatic\./,
      ),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: 'builders' }),
    ).toBeVisible()

    const builders = page.getByRole('region', { name: 'builders' })
    const builderLink = builders.locator('a[href^="/u/"]').first()
    requireE2EPrerequisite(
      (await builderLink.count()) > 0,
      'needs a builder with a public profile in the city (populated persona, playwright/fixtures/fixtures.md)',
    )
    const href = (await builderLink.getAttribute('href')) ?? ''
    await builderLink.click()
    await expect
      .poll(() => pathname(page.url()))
      .toBe(new URL(href, page.url()).pathname)
    await expectSettled(page, page.getByRole('heading', { level: 1 }))
  })
})
