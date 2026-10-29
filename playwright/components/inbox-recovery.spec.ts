import { expect, test } from './fixtures'

test.use({ timezoneId: 'Asia/Kolkata' })

for (const width of [320, 390, 1280]) {
  test(`Inbox draft identity, send completion and history work at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/inbox')
    const input = page.getByRole('textbox', { name: 'Message', exact: true })
    await input.fill('For Ana only')
    await page.getByRole('checkbox', { name: 'hold sends' }).check()
    await page
      .getByRole('button', { name: 'Send message', exact: true })
      .click()
    await page.getByRole('button', { name: 'draft Bo', exact: true }).click()
    await expect(input).toHaveValue('')
    await input.fill('Keep Bo draft')
    await page
      .getByRole('button', { name: 'complete send', exact: true })
      .click()
    await expect(input).toHaveValue('Keep Bo draft')
    await expect(
      page.getByText('write the first message', { exact: true }),
    ).toBeVisible()
    await page.getByRole('checkbox', { name: 'hold sends' }).uncheck()
    await input.press('Enter')
    await expect(page.getByRole('status')).toHaveText('opened fixture-bo')
    await expect(page.getByText('Keep Bo draft', { exact: true })).toBeVisible()
    await page
      .getByRole('button', { name: 'open conversation', exact: true })
      .click()
    await page
      .getByRole('button', { name: 'load older messages', exact: true })
      .click()
    await expect(
      page.getByText('An older message', { exact: true }),
    ).toBeVisible()
    await input.fill('A conversation reply')
    await input.press('Enter')
    await expect(input).toHaveValue('')
    await expect(
      page.getByText('A conversation reply', { exact: true }),
    ).toBeVisible()
    await expect(input).toBeInViewport()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
  })
}

test('recovery shows a UTC deadline and expires while mounted in another time zone', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2030-02-01T11:59:00Z') })
  await page.clock.pauseAt(new Date('2030-02-01T11:59:50Z'))
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/recovery')
  await expect(page.locator('time')).toContainText('12:00 PM UTC')
  await expect(
    page.getByRole('button', { name: 'restore account', exact: true }),
  ).toBeVisible()
  await page.clock.runFor(10_001)
  await expect(
    page.getByRole('heading', { name: 'account unavailable', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'restore account', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'sign out', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'signed out', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
})

test('recovery invokes the memory restoration adapter before the deadline', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2030-02-01T11:00:00Z') })
  await page.goto('/recovery')
  await page
    .getByRole('button', { name: 'restore account', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'account restored', exact: true }),
  ).toBeVisible()
})

test('a recipient becoming unavailable keeps the draft and disables both send paths until recovery', async ({
  page,
}) => {
  await page.goto('/inbox')
  await page
    .getByRole('button', { name: 'open conversation', exact: true })
    .click()
  const input = page.getByRole('textbox', { name: 'Message', exact: true })
  const send = page.getByRole('button', { name: 'Send message', exact: true })
  await input.fill('Draft waiting for recovery')
  await page
    .getByRole('checkbox', { name: 'recipient unavailable', exact: true })
    .check()
  await expect(send).toBeDisabled()
  await expect(page.getByRole('status')).toContainText('account is unavailable')
  await input.press('Enter')
  await expect(input).toHaveValue('Draft waiting for recovery')
  await page
    .getByRole('checkbox', { name: 'recipient unavailable', exact: true })
    .uncheck()
  await expect(send).toBeEnabled()
  await input.press('Enter')
  await expect(input).toHaveValue('')
  await expect(
    page.getByText('Draft waiting for recovery', { exact: true }),
  ).toBeVisible()
})
