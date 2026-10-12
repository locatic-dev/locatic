import { expect, expectSettled, test } from './fixtures/test'

test.describe('unsubscribe page', () => {
  test('is not indexed and changes nothing until the button is pressed', async ({
    page,
  }) => {
    await page.goto('/unsubscribe?t=invalid')
    await expectSettled(
      page,
      page.getByRole('heading', {
        name: 'Stop Locatic updates for this address?',
      }),
    )
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex',
    )

    await page.getByRole('button', { name: 'Unsubscribe' }).click()
    await expect(page.getByRole('alert')).toContainText(
      "This link doesn't work. Manage email from Settings after signing in.",
    )
    await expect(page.getByRole('button')).toHaveCount(0)
  })

  test('explains a link with no token', async ({ page }) => {
    await page.goto('/unsubscribe')
    await expectSettled(page, page.getByRole('alert'))
    await expect(page.getByRole('alert')).toContainText(
      "This link doesn't work.",
    )
  })
})
