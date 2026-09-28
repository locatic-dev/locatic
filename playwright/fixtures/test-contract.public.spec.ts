import { expect, expectSettled, test } from './test'

test('application error states always fail, including smoke mode', async ({
  page,
}) => {
  await page.setContent(`
    <main>
      <h1>couldn't load this page.</h1>
      <p>ArgumentValidationError: invalid request</p>
    </main>
  `)

  await expect(
    expectSettled(page, page.getByRole('heading', { name: 'ready' })),
  ).rejects.toThrow(
    /the page rendered its error state:[\s\S]*ArgumentValidationError: invalid request/,
  )
})
