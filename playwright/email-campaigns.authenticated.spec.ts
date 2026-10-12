import {
  expect,
  expectSettled,
  requireE2EPrerequisite,
  test,
} from './fixtures/test'

// Writes and tests an update without ever sending it. Needs the populated
// user on the email admin allowlist and test sending on, with
// delivered@resend.dev allowlisted (playwright/fixtures/fixtures.md).
const TEST_ADDRESS = 'delivered@resend.dev'

test('writes, previews and tests an update, then stops at the send confirmation', async ({
  page,
}) => {
  await page.goto('/home')
  await expectSettled(page, page.getByRole('button', { name: 'Account menu' }))
  await page.getByRole('button', { name: 'Account menu' }).click()
  const menuItem = page.getByRole('menuitem', { name: 'email campaigns' })
  requireE2EPrerequisite(
    await menuItem.isVisible(),
    "add the populated user's Clerk id to EMAIL_ADMIN_CLERK_IDS on the development deployment",
  )
  await menuItem.click()
  await expectSettled(
    page,
    page.getByRole('heading', { name: 'email campaigns' }),
  )

  await page.getByRole('button', { name: 'New update' }).click()
  const subject = `E2E update ${Date.now()}`
  await page.getByLabel('Subject').fill(subject)
  await page
    .getByLabel('Message')
    .fill('This draft checks the editor and is **never sent**.')
  await expect(
    page.frameLocator('iframe[title="Email preview"]').getByText('never sent'),
  ).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText('Draft saved.')).toBeVisible()

  await page.getByRole('tab', { name: 'Test' }).click()
  const recipient = page.getByLabel('Send a test to')
  requireE2EPrerequisite(
    await recipient.isEnabled(),
    'set EMAIL_TEST_SENDING_ENABLED=true on the development deployment',
  )
  requireE2EPrerequisite(
    (await page.getByText(/^Allowed: /).textContent())?.includes(
      TEST_ADDRESS,
    ) ?? false,
    `add ${TEST_ADDRESS} to EMAIL_TEST_RECIPIENTS on the development deployment`,
  )
  await recipient.fill(TEST_ADDRESS)
  await page.getByRole('button', { name: 'Send test' }).click()
  await expect(page.getByText(`Test sent to ${TEST_ADDRESS}.`)).toBeVisible()

  await page.getByRole('tab', { name: 'Send' }).click()
  const review = page.getByRole('button', { name: 'Review and send' })
  await review.click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('heading', {
      name: /^Send “.+” to about [\d,]+\+? (person|people)\?$/,
    }),
  ).toBeVisible()
  // Never confirm: close the dialog and check focus returns.
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(review).toBeFocused()
})
