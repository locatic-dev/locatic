import { expect, test, type Locator, type Page } from '@playwright/test'

async function skipOnOnboarding(page: Page) {
  if (new URL(page.url()).pathname === '/onboarding') {
    test.skip(true, 'authenticated user is still in onboarding')
  }
}

async function expectAboveMobileNav(page: Page, locator: Locator) {
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  const [targetBox, navBox] = await Promise.all([
    locator.boundingBox(),
    nav.boundingBox(),
  ])

  expect(targetBox).not.toBeNull()
  expect(navBox).not.toBeNull()
  expect(targetBox!.y + targetBox!.height).toBeLessThanOrEqual(navBox!.y)
}

async function expectTouchTarget(locator: Locator) {
  const box = await locator.boundingBox()

  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThanOrEqual(44)
  expect(box!.height).toBeGreaterThanOrEqual(44)
}

for (const width of [320, 360]) {
  test(`inbox composer stays above mobile nav at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/inbox?tab=inbox')
    await skipOnOnboarding(page)

    const firstConversation = page
      .getByRole('button', { name: /open conversation with/i })
      .first()

    if ((await firstConversation.count()) === 0) {
      test.skip(true, 'authenticated user has no inbox conversations')
    }

    await firstConversation.click()

    const textarea = page.getByPlaceholder(/write a message/)
    const sendButton = page.getByRole('button', { name: /send/i })

    await expect(textarea).toBeVisible()
    await expect(sendButton).toBeVisible()
    await expectAboveMobileNav(page, textarea)
    await expectAboveMobileNav(page, sendButton)
  })

  test(`project detail mobile affordances stay clear at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/explore')
    await skipOnOnboarding(page)

    const firstProjectLink = page.locator('a[href^="/project/"]').first()

    if ((await firstProjectLink.count()) === 0) {
      test.skip(true, 'authenticated user has no explore projects')
    }

    await firstProjectLink.click()
    await expect(page).toHaveURL(/\/project\//)
    await expect(page.getByText('imported from GitHub')).toHaveCount(0)

    const visibleLiker = page
      .getByRole('button', { name: /open .+'s profile/i })
      .first()

    if ((await visibleLiker.count()) > 0) {
      await visibleLiker.click()
      await expect(page).toHaveURL(/\/u\//)
      await page.goBack()
    }

    const tabList = page.getByRole('tablist').first()
    await tabList.scrollIntoViewIfNeeded()
    await expect(tabList).toBeVisible()
    await expectAboveMobileNav(page, tabList)
  })

  test(`explore card actions remain tappable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/explore')
    await skipOnOnboarding(page)

    const firstProjectLink = page.locator('a[href^="/project/"]').first()

    if ((await firstProjectLink.count()) === 0) {
      test.skip(true, 'authenticated user has no explore projects')
    }

    const card = firstProjectLink.locator(
      'xpath=ancestor::div[contains(@class, "lx-card")][1]',
    )

    await expectTouchTarget(
      card.getByRole('button', { name: /dismiss/i }).first(),
    )
    await expectTouchTarget(
      card.getByRole('button', { name: /comments/i }).first(),
    )

    await card.click({ position: { x: 10, y: 10 } })
    await expect(page).toHaveURL(/\/project\//)
  })
}
