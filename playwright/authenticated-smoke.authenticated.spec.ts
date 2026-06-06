import { expect, test } from '@playwright/test'

test('opens authenticated Locatic UI without manual sign-in', async ({
  page,
}) => {
  await page.goto('/home')

  await expect(page).not.toHaveURL(/\/sign-in/)
  await expect(
    page.locator('main#main-content').or(page.getByText(/step \d of 5/)),
  ).toBeVisible()

  if (new URL(page.url()).pathname === '/onboarding') {
    await expect(page.getByText(/step \d of 5/)).toBeVisible()
    return
  }

  await expect(page).toHaveURL(/\/home/)
  await expect(page.locator('main#main-content')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Explore' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Profile' })).toBeVisible()
})
