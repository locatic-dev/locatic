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

// B11 touch-target audit: at a 390px phone viewport every visible interactive
// control in the app shell is at least 44x44, tab captions are never
// truncated, and the contribution graph keeps cells of at least 10px.

const PHONE = { width: 390, height: 844 }
const MIN_TARGET = 44
const INTERACTIVE =
  'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="switch"], [role="tab"], [tabindex]:not([tabindex="-1"])'

test.use({ viewport: PHONE, hasTouch: true, isMobile: true })

async function gotoShellPage(page: Page, path: string) {
  await page.goto(path)
  requireOnboardedPersona(page)
  await expectSettled(page, page.getByRole('heading', { level: 1 }).first())
  await expectNoPendingContent(page)
}

/**
 * Returns every visible interactive element inside `scope` whose box is under
 * 44px in either direction. Visually hidden controls (sr-only radios whose
 * label is the target) render at 1px and are left to their labels.
 */
async function undersizedTargets(scope: Locator) {
  return scope.evaluate(
    (root, { selector, min }) =>
      [...root.querySelectorAll<HTMLElement>(selector)]
        .map((element) => {
          const box = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return {
            name:
              element.getAttribute('aria-label') ??
              element.textContent?.trim().slice(0, 40) ??
              element.tagName,
            width: Math.round(box.width),
            height: Math.round(box.height),
            hidden:
              style.visibility === 'hidden' ||
              style.display === 'none' ||
              box.width <= 1 ||
              box.height <= 1,
          }
        })
        .filter(
          (target) =>
            !target.hidden && (target.width < min || target.height < min),
        ),
    { selector: INTERACTIVE, min: MIN_TARGET },
  )
}

async function expectMinBox(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  // Rounded like `undersizedTargets`: a 44px box can measure 43.9999px.
  expect(Math.round(box!.width)).toBeGreaterThanOrEqual(MIN_TARGET)
  expect(Math.round(box!.height)).toBeGreaterThanOrEqual(MIN_TARGET)
}

async function expectNotTruncated(locator: Locator) {
  const { scrollWidth, clientWidth } = await locator.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
}

async function expectNoHorizontalPageScroll(page: Page) {
  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  )
  expect(scrollWidth).toBeLessThanOrEqual(PHONE.width)
}

test('mobile tab bar: sidebar order, 44px tabs, untruncated captions', async ({
  page,
}) => {
  await gotoShellPage(page, '/home')

  const tabBar = page.getByRole('navigation', { name: 'Main navigation' })
  await expect(tabBar).toBeVisible()

  const tabs = tabBar.getByRole('link')
  await expect(tabs).toHaveCount(5)
  expect(
    await tabs.evaluateAll((links) =>
      links.map((link) => new URL((link as HTMLAnchorElement).href).pathname),
    ),
  ).toEqual(['/home', '/explore', '/inbox', '/notifications', '/profile'])

  for (const tab of await tabs.all()) {
    await expectMinBox(tab)
    // The caption is the last child span of each tab.
    await expectNotTruncated(tab.locator(':scope > span').last())
  }
  await expect(
    tabBar.getByRole('link', { name: /^notifications/ }),
  ).toContainText('alerts')

  expect(await undersizedTargets(tabBar)).toEqual([])
})

test('page header actions are touch sized', async ({ page }) => {
  await gotoShellPage(page, '/home')

  const header = page.locator('main#main-content header').first()
  await expect(header.getByRole('heading', { level: 1 })).toBeVisible()
  expect(await undersizedTargets(header)).toEqual([])
})

test('explore city pills keep a 44px remove target', async ({ page }) => {
  await gotoShellPage(page, '/explore')
  // Below xl the city pills live in the filter sheet.
  await page.getByRole('button', { name: /^filters/ }).click()
  const sheet = page.getByRole('dialog', { name: 'filters' })
  await expect(sheet).toBeVisible()
  // The sheet slides up; hit-test only once it has stopped moving.
  await waitForFiniteAnimations(page)

  const removeButtons = sheet.getByRole('button', { name: /^Remove / })
  requireE2EPrerequisite(
    (await removeButtons.count()) > 0,
    'Explore shows the populated user no selected city (playwright/fixtures/fixtures.md)',
  )

  for (const button of await removeButtons.all()) {
    await expectMinBox(button)
    // The pill must not clip the hit area: a tap near the bottom edge of the
    // 44px box, outside the 28px pill, still lands on this button.
    const box = (await button.boundingBox())!
    const hitName = await page.evaluate(
      ({ x, y }) =>
        document
          .elementFromPoint(x, y)
          ?.closest('button')
          ?.getAttribute('aria-label') ?? null,
      { x: box.x + box.width / 2, y: box.y + box.height - 2 },
    )
    expect(hitName).toBe(await button.getAttribute('aria-label'))
  }
})

test('explore reaction pills keep 44px parts on a touch device', async ({
  page,
}) => {
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(true)
  await page.goto('/explore?scope=global')
  requireOnboardedPersona(page)
  const projects = await settledProjectFeed(page)
  requireE2EPrerequisite(
    (await projects.count()) > 0,
    'Explore shows no project in any city (playwright/fixtures/fixtures.md)',
  )

  const pill = page.locator('main#main-content [data-reaction-pill]').first()
  await expect(pill).toBeVisible()

  // A zero-count pill is itself the button; a counted pill holds two.
  const isButton = await pill.evaluate(
    (element) => element.tagName === 'BUTTON',
  )
  const parts = isButton ? [pill] : await pill.getByRole('button').all()
  expect(parts.length).toBeGreaterThan(0)
  for (const part of parts) {
    await expectMinBox(part)
  }
})

test('explore project cards keep a 44px city link clear of the author link', async ({
  page,
}) => {
  await page.goto('/explore?scope=global')
  requireOnboardedPersona(page)
  const projects = await settledProjectFeed(page)
  requireE2EPrerequisite(
    (await projects.count()) > 0,
    'Explore shows no project in any city (playwright/fixtures/fixtures.md)',
  )

  const cityLink = page
    .getByRole('region', { name: 'projects results' })
    .locator('a[href^="/c/"]')
    .first()
  requireE2EPrerequisite(
    (await cityLink.count()) > 0,
    'Explore shows no project by an exact-city builder (playwright/fixtures/fixtures.md)',
  )
  await expect(cityLink).toBeVisible()
  await cityLink.scrollIntoViewIfNeeded()
  await expectMinBox(cityLink)

  // The narrow card puts the city under the author's name: a tap on the
  // link's centre, or just inside its top edge, opens the city page, not the
  // author's profile above it or the project link stretched under the card.
  const box = (await cityLink.boundingBox())!
  const href = await cityLink.getAttribute('href')
  for (const y of [box.y + box.height / 2, box.y + 2]) {
    const hitHref = await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.closest('a')?.getAttribute('href') ??
        null,
      { x: box.x + box.width / 2, y },
    )
    expect(hitHref).toBe(href)
  }
})

test('settings tabs and appearance options are touch sized', async ({
  page,
}) => {
  await gotoShellPage(page, '/settings?tab=account')

  const tabRow = page.getByRole('navigation', { name: 'settings sections' })
  await expect(tabRow).toBeVisible()
  expect(await undersizedTargets(tabRow)).toEqual([])
  for (const tab of await tabRow.getByRole('button').all()) {
    await expectNotTruncated(tab)
  }

  const themeGroup = page.getByRole('group', { name: 'accent theme' })
  for (const radio of await themeGroup.getByRole('radio').all()) {
    const label = themeGroup.locator(
      `label[for="${await radio.getAttribute('id')}"]`,
    )
    await expectMinBox(label)
  }

  await expectNoHorizontalPageScroll(page)
})

test('profile tabs form one scrollable row and the graph keeps 10px cells', async ({
  page,
}) => {
  await gotoShellPage(page, '/profile?tab=liked')

  // The content tab row is the parent of the current tab.
  const active = page.locator('button[aria-current="true"]')
  await expect(active).toContainText('liked')
  const row = active.locator('xpath=..')
  const tabs = row.getByRole('button')
  await expect(tabs).toHaveCount(5)

  const tops = new Set<number>()
  for (const tab of await tabs.all()) {
    await expectMinBox(tab)
    await expectNotTruncated(tab)
    tops.add(Math.round((await tab.boundingBox())!.y))
  }
  expect(tops.size).toBe(1)

  // The active tab (last in the row) was scrolled into the row's viewport.
  const [activeBox, rowBox] = await Promise.all([
    active.boundingBox(),
    row.boundingBox(),
  ])
  expect(activeBox!.x).toBeGreaterThanOrEqual(rowBox!.x - 1)
  expect(activeBox!.x + activeBox!.width).toBeLessThanOrEqual(
    rowBox!.x + rowBox!.width + 1,
  )
  expect(await undersizedTargets(row)).toEqual([])

  const graph = page.getByRole('region', { name: 'GitHub contribution graph' })
  if ((await graph.count()) > 0) {
    const cellWidth = await graph
      .locator('rect')
      .first()
      .evaluate((rect) => rect.getBoundingClientRect().width)
    expect(cellWidth).toBeGreaterThanOrEqual(10)
  }

  await expectNoHorizontalPageScroll(page)
})
