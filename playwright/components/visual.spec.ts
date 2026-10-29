import { expect, test } from './fixtures'

// These committed images are rendered exclusively from local synthetic data.
// Provider-backed route baselines belong in external, private baseline storage.
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`synthetic baselines at ${viewport.width}px`, () => {
    test.use({ viewport, colorScheme: 'dark' })
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.clock.install({ time: new Date('2030-01-01T12:05:00Z') })
    })

    for (const selected of [false, true]) {
      test(`inbox ${selected ? 'conversation' : 'list'}`, async ({ page }) => {
        await page.goto('/visual-inbox')
        const row = page.getByRole('button', {
          name: /^open conversation with Demo Builder/i,
        })
        await expect(row).toBeVisible()
        if (selected) await row.click()
        await expect(
          page.getByText('Synthetic message for visual testing.').last(),
        ).toBeVisible()
        await expect(page.getByText('Example City').last()).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await expect(page).toHaveScreenshot(
          `inbox-${selected ? 'conversation' : 'list'}-${viewport.width}.png`,
          { animations: 'disabled' },
        )
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true)
      })
    }

    test('privacy controls', async ({ page }) => {
      await page.goto('/')
      await expect(
        page.getByRole('heading', { name: 'Privacy and discovery' }),
      ).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await expect(page).toHaveScreenshot(
        `privacy-controls-${viewport.width}.png`,
      )
    })

    test('account recovery', async ({ page }) => {
      await page.goto('/recovery')
      await expect(
        page.getByRole('button', { name: 'restore account', exact: true }),
      ).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await expect(page).toHaveScreenshot(
        `account-recovery-${viewport.width}.png`,
      )
    })
  })
}
