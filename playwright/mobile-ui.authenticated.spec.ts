import type { Locator, Page } from '@playwright/test'
import { settledProjectFeed } from './fixtures/explore'
import { requireOnboardedPersona } from './fixtures/personas'
import {
  expect,
  expectNoPendingContent,
  expectSettled,
  requireE2EPrerequisite,
  test,
  waitForFiniteAnimations,
} from './fixtures/test'

async function settledProjectPage(page: Page) {
  await expectSettled(page, page.getByRole('heading', { level: 1 }).first())
  await expectNoPendingContent(page)
  await waitForFiniteAnimations(page)
}

const NO_EXPLORE_PROJECTS =
  'Explore shows no project in any city (playwright/fixtures/fixtures.md)'

/**
 * `locator`'s bottom edge sits at or above the mobile tab bar. Polled, so a
 * smooth scroll that is still running settles first.
 */
async function expectAboveMobileNav(page: Page, locator: Locator) {
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  await expect
    .poll(
      async () => {
        const [targetBox, navBox] = await Promise.all([
          locator.boundingBox(),
          nav.boundingBox(),
        ])
        return targetBox && navBox
          ? Math.round(navBox.y - (targetBox.y + targetBox.height))
          : null
      },
      { message: 'pixels between the bottom edge and the mobile tab bar' },
    )
    .toBeGreaterThanOrEqual(0)
}

async function expectTouchTarget(locator: Locator) {
  const box = await locator.boundingBox()

  expect(box).not.toBeNull()
  // Rounded: layout can land a 44px box at 43.9999px.
  expect(Math.round(box!.width)).toBeGreaterThanOrEqual(44)
  expect(Math.round(box!.height)).toBeGreaterThanOrEqual(44)
}

for (const width of [320, 360]) {
  test(`inbox composer stays above mobile nav at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/inbox?tab=inbox')
    requireOnboardedPersona(page)

    const list = page.getByRole('region', { name: 'conversations' })
    const firstConversation = list
      .getByRole('button', { name: /^open conversation with/i })
      .first()
    await expectSettled(
      page,
      firstConversation.or(
        list.getByRole('heading', { name: 'no conversations yet' }),
      ),
    )
    requireE2EPrerequisite(
      (await firstConversation.count()) > 0,
      'the populated user has no inbox conversation (playwright/fixtures/fixtures.md)',
    )

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
    await page.goto('/explore?scope=global')
    requireOnboardedPersona(page)

    const firstProjectLink = (await settledProjectFeed(page)).first()
    requireE2EPrerequisite(
      (await firstProjectLink.count()) > 0,
      NO_EXPLORE_PROJECTS,
    )

    await firstProjectLink.click()
    await expect(page).toHaveURL(/\/project\//)
    await settledProjectPage(page)
    await expect(page.getByText('imported from GitHub')).toHaveCount(0)

    const visibleLiker = page
      .getByRole('button', { name: /open .+'s profile/i })
      .first()

    if ((await visibleLiker.count()) > 0) {
      await visibleLiker.click()
      await expect(page).toHaveURL(/\/u\//)
      await page.goBack()
      await settledProjectPage(page)
    }

    // Measured once the page stops loading, so late content above the tabs
    // cannot move them after the scroll.
    const tabList = page.getByRole('tablist').first()
    await tabList.scrollIntoViewIfNeeded()
    await expect(tabList).toBeInViewport()
    await expectAboveMobileNav(page, tabList)
  })

  test.describe(`explore card actions on a touch device at ${width}px`, () => {
    // 44px targets apply only on coarse pointers, so this needs touch
    // emulation rather than a narrow viewport alone.
    test.use({ hasTouch: true, isMobile: true })

    test(`explore card actions remain tappable at ${width}px`, async ({
      page,
    }) => {
      expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      ).toBe(true)
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/explore?scope=global')
      requireOnboardedPersona(page)

      const firstProjectLink = (await settledProjectFeed(page)).first()
      requireE2EPrerequisite(
        (await firstProjectLink.count()) > 0,
        NO_EXPLORE_PROJECTS,
      )

      const card = firstProjectLink.locator(
        'xpath=ancestor::div[contains(@class, "lx-card")][1]',
      )

      await expectTouchTarget(
        card.getByRole('button', { name: /dismiss/i }).first(),
      )
      await expectTouchTarget(
        card.getByRole('link', { name: /comment|conversation/i }).first(),
      )

      await card.click({ position: { x: 10, y: 10 } })
      await expect(page).toHaveURL(/\/project\//)
    })
  })
}
