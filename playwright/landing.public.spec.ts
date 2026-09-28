import { expect, requireE2EPrerequisite, test } from './fixtures/test'

test.describe('public landing', () => {
  test('hydrates without errors and keeps the skip link functional on every public route', async ({
    page,
  }) => {
    const pageErrors: string[] = []
    const consoleErrors: string[] = []

    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text())
      }
    })

    await page.emulateMedia({ reducedMotion: 'reduce' })

    for (const path of ['/', '/privacy', '/terms']) {
      await page.goto(path)

      const main = page.locator('main#main-content')
      await expect(main).toBeVisible()
      await page.keyboard.press('Tab')
      await expect(
        page.getByRole('link', { name: 'Skip to main content' }),
      ).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(main).toBeFocused()
    }

    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])

    await page.goto('/not-a-real-route')
    const notFoundMain = page.locator('main#main-content')
    await expect(notFoundMain).toBeVisible()
    // The 404 page always draws the example pins, which ping; the landing
    // map pings only while it shows the example (plan item D7).
    await expect(page.locator('.lx-dot-map-ping').first()).toHaveCSS(
      'display',
      'none',
    )
    await page.keyboard.press('Tab')
    await expect(
      page.getByRole('link', { name: 'Skip to main content' }),
    ).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(notFoundMain).toBeFocused()
  })

  test('has no horizontal overflow at supported public breakpoints', async ({
    page,
  }) => {
    for (const viewport of [
      { width: 375, height: 667 },
      { width: 768, height: 1024 },
      { width: 1440, height: 1000 },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto('/')
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(viewport.width)
    }
  })

  test('shows real cities and projects, or labels the examples (D7)', async ({
    page,
  }) => {
    await page.goto('/')
    const main = page.locator('main#main-content')

    // Hero map: real cities with builders as links to their pages, or the
    // example label while fewer than five cities have builders.
    const mapCaption = main.getByText(/^on the map: builders in /)
    const exampleMap = main.getByText(
      'the map pins are illustrative until more cities have builders',
    )
    await expect(mapCaption.or(exampleMap)).toBeVisible()
    if (await mapCaption.isVisible()) {
      await expect(exampleMap).toHaveCount(0)
      const cityLinks = mapCaption.getByRole('link')
      await expect(cityLinks).toHaveCount(3)
      await expect(cityLinks.first()).toHaveAttribute('href', /^\/c\/[\w-]+$/)
    }

    // Project column: real public projects linking to their pages, or the
    // labelled example card when none is eligible.
    const realProjects = main.getByText(
      'recently updated public projects on locatic',
    )
    const exampleCard = main.getByText(
      'how your project appears to builders nearby',
    )
    await expect(realProjects.or(exampleCard)).toHaveCount(1)
    if ((await realProjects.count()) === 1) {
      const showcase = main.locator('figure', { has: realProjects })
      await expect(showcase.getByText('example', { exact: true })).toHaveCount(
        0,
      )
      const projects = showcase.getByRole('listitem')
      expect(await projects.count()).toBeGreaterThanOrEqual(1)
      expect(await projects.count()).toBeLessThanOrEqual(3)
      await expect(projects.first().getByRole('link').first()).toHaveAttribute(
        'href',
        /^\/project\/[^/]+\/[^/]+$/,
      )
    }
  })

  test('visitor goes from a landing city to its city page', async ({
    page,
  }) => {
    await page.goto('/')
    const mapCaption = page.getByText(/^on the map: builders in /)
    requireE2EPrerequisite(
      await mapCaption.isVisible(),
      'Needs at least five cities with builders in the deployment; the landing shows the example map until then.',
    )

    const firstCity = mapCaption.getByRole('link').first()
    const cityName = (await firstCity.textContent()) ?? ''
    await firstCity.click()

    await expect(page).toHaveURL(/\/c\/[\w-]+$/)
    await expect(
      page.getByRole('heading', { level: 1, name: cityName }),
    ).toBeVisible()
  })
})
