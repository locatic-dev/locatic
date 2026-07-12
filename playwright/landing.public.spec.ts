import { expect, test } from '@playwright/test'

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
    await page.goto('/')
    await expect(page.locator('.lx-dot-map-ping').first()).toHaveCSS(
      'display',
      'none',
    )

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
})
