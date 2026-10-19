import {
  expect,
  expectSettled,
  requireE2EPrerequisite,
  test,
} from './fixtures/test'

// Writes (autosaved) and tests an update without ever sending it, then
// discards the draft so runs leave nothing behind. Needs the populated
// user on the email admin allowlist and test sending on, with
// delivered@resend.dev allowlisted (playwright/fixtures/fixtures.md).
const TEST_ADDRESS = 'delivered@resend.dev'

test('writes, previews and tests an update, stops at the send confirmation, then discards it', async ({
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

  await page.getByRole('link', { name: 'New update' }).click()
  // Nothing is stored until the draft has content.
  await expect(page).toHaveURL(/\/admin\/emails\/new\?kind=update$/)
  await expect(page.getByText('Saves as you type')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Test' })).toBeDisabled()
  const subject = `E2E update ${Date.now()}`
  await page.getByLabel('Subject').fill(subject)
  await page
    .getByLabel('Message')
    .fill('This draft checks the editor and is **never sent**.')
  await expect(
    page.frameLocator('iframe[title="Email preview"]').getByText('never sent'),
  ).toBeVisible({ timeout: 15_000 })
  // The first autosave creates the campaign and moves to its URL.
  await expect(page).toHaveURL(/\/admin\/emails\/(?!new)[^/?]+$/, {
    timeout: 10_000,
  })
  await expect(page.getByText(/^Saved/)).toBeVisible()

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
  await expect(
    page.getByText(`Test email queued for ${TEST_ADDRESS}.`),
  ).toBeVisible()

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

  page.once('dialog', (confirm) => void confirm.accept())
  await page.getByRole('button', { name: 'Discard draft' }).click()
  await expect(page).toHaveURL(/\/admin\/emails\/?$/)
  await expect(page.getByRole('link', { name: subject })).toHaveCount(0)

  await page.getByRole('link', { name: 'sent log' }).click()
  await expect(page.getByRole('heading', { name: 'sent emails' })).toBeVisible()
})
