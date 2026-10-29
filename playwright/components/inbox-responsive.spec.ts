import { expect, test } from './fixtures'

for (const width of [390, 768, 900, 1024, 1440]) {
  test(`Inbox uses readable panes with an expanded sidebar at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/responsive-inbox')
    const list = page.getByRole('region', {
      name: 'conversations',
      exact: true,
    })
    const thread = page.getByRole('region', {
      name: 'conversation',
      exact: true,
    })
    await page
      .getByRole('button', { name: /^open conversation with Demo Builder/i })
      .click()
    await expect(thread).toBeVisible()
    const input = page.getByRole('textbox', { name: 'Message', exact: true })
    await expect(input).toBeInViewport()
    expect((await input.boundingBox())!.width).toBeGreaterThanOrEqual(240)
    const back = page.getByRole('button', { name: 'back', exact: true })
    if (width < 1024) {
      await expect(list).toBeHidden()
      await expect(back).toBeVisible()
      await back.click()
      await expect(list).toBeVisible()
      await expect(thread).toBeHidden()
      if (width === 900) {
        await page
          .getByRole('button', { name: 'collapse sidebar', exact: true })
          .click()
        await page
          .getByRole('button', {
            name: /^open conversation with Demo Builder/i,
          })
          .click()
        await expect(list).toBeVisible()
        await expect(back).toBeHidden()
      }
    } else {
      await expect(list).toBeVisible()
      await expect(back).toBeHidden()
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })
}
