import { expect, test } from './fixtures/test'

for (const path of ['/inbox', '/inbox?conversation=null&compose=null']) {
  test(`keeps the Inbox sign-in destination free of placeholder ids: ${path}`, async ({
    page,
  }) => {
    await page.goto(path)
    await expect(page).toHaveURL(/\/sign-in\?redirect=/)
    const redirect = new URL(page.url()).searchParams.get('redirect')
    expect(redirect).toBe('/inbox')
    await expect(
      page.getByRole('heading', { name: "couldn't open this conversation" }),
    ).toHaveCount(0)
  })
}
