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
    // The hero globe may bleed past its column; it must never scroll the page.
    for (const viewport of [
      { width: 320, height: 640 },
      { width: 375, height: 667 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1280, height: 900 },
      { width: 1440, height: 1000 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto('/')
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(viewport.width)
    }
  })

  test('shows real cities and activity cards, never examples (D7)', async ({
    page,
  }) => {
    await page.goto('/')
    const main = page.locator('main#main-content')
    await expect(main.getByText('EXAMPLE', { exact: true })).toHaveCount(0)

    // Hero globe: real cities with builders as links to their pages.
    const mapCaption = main.getByText(/^on the map: builders in /)
    if (await mapCaption.isVisible()) {
      const cityLinks = mapCaption.getByRole('link')
      await expect(cityLinks).toHaveCount(3)
      await expect(cityLinks.first()).toHaveAttribute('href', /^\/c\/[\w-]+$/)
    }

    // Ping globe: the card, when one is up, links to what it describes. The
    // globe is aria-hidden, so its link is found by tag, not role.
    const pingGlobe = main.getByRole('region', {
      name: 'recent activity on the map',
    })
    await expect(pingGlobe).toBeVisible()
    await expect(pingGlobe.locator('canvas')).toBeVisible()
    await expect(main.getByText('recently on the map')).toHaveCount(0)
  })

  test('shows a still frame of three pinged cities under reduced motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const pingGlobe = page
      .locator('main#main-content')
      .getByRole('region', { name: 'recent activity on the map' })
    const pinged = pingGlobe.locator('[data-ping-key][data-active="true"]')
    const card = pingGlobe.locator('[data-ping-card]')
    requireE2EPrerequisite(
      (await pinged.count()) >= 3,
      'Needs at least three recent activity items in the deployment.',
    )

    await expect(pinged).toHaveCount(3)
    const pingedKeys = await pinged.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-ping-key')),
    )
    const cardKey = await card.getAttribute('data-ping-card')

    // Longer than one ping interval: nothing moves.
    await page.waitForTimeout(3_000)
    await expect(pinged).toHaveCount(3)
    expect(
      await pinged.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-ping-key')),
      ),
    ).toEqual(pingedKeys)
    await expect(card).toHaveAttribute('data-ping-card', cardKey ?? '')
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
