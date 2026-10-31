import { waitForClerk } from './fixtures/personas'
import { expect, test } from './fixtures/test'

test('loads Clerk UI when sign-in is requested, without prefetching it on the landing', async ({
  page,
}) => {
  const uiRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/npm/@clerk/ui@'))
      uiRequests.push(request.url())
  })
  await page.goto('/')
  await expect(
    page.getByRole('heading', { level: 1, name: 'github, with a map.' }),
  ).toBeVisible()
  await waitForClerk(page)
  expect(uiRequests).toEqual([])

  await page
    .getByRole('navigation', { name: 'Site' })
    .getByRole('link', { name: 'sign in', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Continue with GitHub' }),
  ).toBeVisible({ timeout: 30_000 })
  expect(uiRequests.length).toBeGreaterThan(0)
})

for (const path of ['/sign-in', '/sign-up']) {
  test(`${path} still loads its auth controls on direct entry`, async ({
    page,
  }) => {
    await page.goto(path)
    await expect(
      page.getByRole('button', { name: 'Continue with GitHub' }),
    ).toBeVisible({ timeout: 30_000 })
  })
}

test('preserves a discovery return URL when a landing visitor requests sign-in', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .getByRole('link', { name: 'explore your city →', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'explore', exact: true }),
  ).toBeVisible()
  await waitForClerk(page)
  await page
    .getByRole('navigation', { name: 'Site', exact: true })
    .getByRole('link', { name: 'sign in', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Continue with GitHub' }),
  ).toBeVisible({ timeout: 30_000 })
  expect(new URL(page.url()).searchParams.get('redirect')).toMatch(
    /^\/explore(?:\?|$)/,
  )
})
