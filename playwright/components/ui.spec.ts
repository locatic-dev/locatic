import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  // Fail for any unexpected remote dependency; fixture QA must be fork-safe.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:3004)/, (route) =>
    route.abort(),
  )
  await page.goto('/')
  test.info().annotations.push({
    type: 'boundary',
    description: 'Real UI, memory saves; no provider/backend integration',
  })
  // Assertions at teardown are provided by the shared fixture below.
  browserErrors.set(page, errors)
})

const browserErrors = new WeakMap<object, string[]>()
test.afterEach(async ({ page }) => expect(browserErrors.get(page)).toEqual([]))

for (const width of [320, 390, 1280]) {
  test(`privacy controls and long identities work at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    const exact = page.getByRole('radio', { name: 'exact city', exact: true })
    await expect(exact).toBeChecked()
    const hidden = page.getByRole('radio', { name: 'hidden', exact: true })
    await hidden.check()
    await expect(hidden).toBeChecked()
    const preview = page.getByRole('region', {
      name: 'Builder identity preview',
    })
    await expect(preview.getByText('Bengaluru, Karnataka, India')).toHaveCount(
      0,
    )
    await page.getByRole('radio', { name: 'region only', exact: true }).check()
    await expect(
      preview.getByText('Karnataka, India', { exact: true }),
    ).toBeVisible()
    const switchControl = page.getByRole('switch', {
      name: 'appear in explore and city pages',
    })
    await switchControl.focus()
    await page.keyboard.press('Space')
    await expect(switchControl).not.toBeChecked()
    await exact.check()
    await exact.focus()
    await page.keyboard.press('ArrowDown')
    await expect(
      page.getByRole('radio', { name: 'region only', exact: true }),
    ).toBeChecked()
    await preview.getByRole('button', { name: 'follow', exact: true }).click()
    await expect(
      preview.getByRole('button', { name: 'following', exact: true }),
    ).toBeVisible()
    const identity = preview.getByText('Alexandria Montgomery-Chandrasekhar', {
      exact: true,
    })
    await expect(identity).toBeVisible()
    expect((await identity.boundingBox())!.width).toBeGreaterThan(150)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
  })
}

test('public legal navigation renders the current email and deletion policies', async ({
  page,
}) => {
  await page
    .getByRole('link', { name: 'terms of service', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Terms of Service' }),
  ).toBeVisible()
  await expect(
    page.getByText(/product updates are enabled by default/),
  ).toBeVisible()
  await page.getByRole('link', { name: 'privacy policy', exact: true }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Privacy Policy' }),
  ).toBeVisible()
  await expect(page.getByText(/30.day/i).first()).toBeVisible()
  await expect(
    page.getByText(/product updates are enabled by default/),
  ).toBeVisible()
  await expect(
    page.getByText(/weekly digest is separate and is sent only if you opt in/),
  ).toBeVisible()
})
