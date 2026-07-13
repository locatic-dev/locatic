import { expect, test, type Page } from '@playwright/test'

async function skipOnOnboarding(page: Page) {
  if (new URL(page.url()).pathname === '/onboarding') {
    test.skip(true, 'authenticated user is still in onboarding')
  }
}

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
  await expect(
    page.getByRole('link', { name: 'Profile', exact: true }),
  ).toBeVisible()
})

test('selects an accent theme with native radio keyboard controls', async ({
  page,
}) => {
  await page.goto('/settings')
  await skipOnOnboarding(page)

  const themeGroup = page.getByRole('group', { name: 'accent theme' })
  const teal = themeGroup.getByRole('radio', { name: 'teal' })
  const violet = themeGroup.getByRole('radio', { name: 'violet' })

  await expect(teal).toBeChecked()
  await teal.focus()
  await page.keyboard.press('ArrowRight')

  await expect(violet).toBeChecked()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'violet')
})
