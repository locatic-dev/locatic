import {
  expect,
  expectSettled,
  requireE2EPrerequisite,
  test,
} from './fixtures/test'

test('edits and reviews the configured internal email draft without requesting delivery', async ({
  page,
}) => {
  const campaignTitle = process.env.E2E_EMAIL_CAMPAIGN_TITLE
  requireE2EPrerequisite(
    Boolean(campaignTitle),
    'set E2E_EMAIL_CAMPAIGN_TITLE to an unsent announcement draft and allowlist the populated Clerk user as an email admin (playwright/fixtures/fixtures.md)',
  )

  await page.goto('/admin/emails')
  const heading = page.getByRole('heading', { name: 'community email' })
  await expectSettled(page, heading)

  const campaign = page.getByRole('button', {
    name: new RegExp(campaignTitle!, 'i'),
  })
  requireE2EPrerequisite(
    (await campaign.count()) > 0,
    `the configured development deployment needs an unsent email campaign titled "${campaignTitle}"`,
  )
  await campaign.click()

  await page.getByLabel('subject').fill('E2E reviewed community update')
  await page
    .getByLabel('introduction')
    .fill(
      'This controlled draft verifies the review path without requesting a send.',
    )
  await page.getByRole('button', { name: 'save draft' }).click()
  await expect(page.getByRole('status')).toContainText(/revision \d+ saved/i)

  await page.getByRole('button', { name: 'prepare review' }).click()
  await expect(page.getByRole('status')).toContainText(/ready for review/i)
  await expect(page.getByTitle('reviewed campaign preview')).toBeVisible()
  await expect(
    page.getByRole('button', { name: /^send to \d+ subscribers$/ }),
  ).toBeVisible()
})
