import type { Page } from '@playwright/test'
import { requireOnboardedPersona } from './fixtures/personas'
import { expect, expectSettled, test } from './fixtures/test'

// Plan items D2 (language and topic filters) and D3 (open to collab). The
// filters live in the URL, so a filtered Explore link is shareable and a
// reload of the same URL shows the same filters and the same first rows.
// Backend behaviour (AND, continuation, read budget) is proved in
// convex/explore.test.ts; this spec checks the journey and rendering.

/**
 * Opens Explore at 1440px, where the filters sit in the rail (Desktop
 * Chrome's 1280px is exactly `xl`), and returns the rail.
 */
async function openExplore(page: Page, search: string) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/explore?${search}`)
  requireOnboardedPersona(page)
  const heading = page.getByRole('heading', { level: 1, name: 'explore' })
  await expectSettled(page, heading)
  return page.getByRole('complementary', { name: 'explore filters' })
}

/**
 * A settled feed, summarised: the projects in order (named by their dismiss
 * buttons), or the state shown when there are none ("keep looking" or an
 * empty state).
 */
async function settledFeed(page: Page) {
  const main = page.locator('#main-content')
  const dismiss = main.getByRole('button', { name: /^Dismiss / })
  const keepLooking = main.getByRole('button', { name: 'keep looking' })
  const empty = main.getByRole('heading', {
    name: 'no projects match these filters.',
  })
  // One of the three settled states must render; an error does not count.
  await expectSettled(page, dismiss.first().or(keepLooking).or(empty))
  const names = await dismiss.evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute('aria-label')),
  )
  if (names.length > 0) return names.join('\n')
  return (await keepLooking.count()) > 0 ? 'keep looking' : 'empty'
}

test('language and topic filters are URL chips that survive a reload', async ({
  page,
}) => {
  const rail = await openExplore(
    page,
    'mode=projects&scope=global&language=TypeScript&topic=AI',
  )

  // Normalised the way the server compares them.
  await expect(rail.getByText('primary language: typescript')).toBeVisible()
  await expect(rail.getByText('topic: #ai')).toBeVisible()
  await expect(page).toHaveURL(/language=typescript/)
  await expect(page).toHaveURL(/topic=ai/)

  const before = await settledFeed(page)
  // Continuation remains or rows exist; a filtered-empty page is never
  // reported as "no results" before the feed is exhausted.
  if (await page.getByRole('button', { name: 'keep looking' }).isVisible()) {
    await expect(
      page.getByText('no projects match these filters.'),
    ).toHaveCount(0)
  }

  await page.reload()
  await expect(rail.getByText('primary language: typescript')).toBeVisible()
  await expect(rail.getByText('topic: #ai')).toBeVisible()
  expect(await settledFeed(page)).toBe(before)
})

test('adds and removes a primary language filter from the rail', async ({
  page,
}) => {
  const rail = await openExplore(page, 'mode=projects&scope=global')

  await rail.getByRole('button', { name: 'filter' }).click()
  const input = page.getByRole('textbox', { name: 'primary language' })
  await input.fill('  Rust ')
  await input.press('Enter')
  await expect(page).toHaveURL(/language=rust/)
  // The filtered query runs as soon as the URL changes.
  await expectSettled(page, rail.getByText('primary language: rust'))

  await rail
    .getByRole('button', { name: 'Remove primary language filter rust' })
    .click()
  await expect(page).not.toHaveURL(/language=/)
  await expect(rail.getByText('primary language: rust')).toHaveCount(0)
})

test('a language quick-pick applies the canonical primary language', async ({
  page,
}) => {
  const rail = await openExplore(page, 'mode=projects&scope=global')

  // Exact: once applied, the chip's "Remove primary language filter
  // typescript" button also contains the name.
  const typescript = rail.getByRole('button', {
    name: 'TypeScript',
    exact: true,
  })
  await expect(typescript).toHaveAttribute('aria-pressed', 'false')
  await typescript.click()
  await expect(page).toHaveURL(/language=typescript/)
  await expect(typescript).toHaveAttribute('aria-pressed', 'true')
  await expect(rail.getByText('primary language: typescript')).toBeVisible()
})

test('open to collab chip filters builders and survives a reload', async ({
  page,
}) => {
  const rail = await openExplore(page, 'mode=builders&scope=global')

  const chip = rail.getByRole('button', { name: 'open to collab' })
  await expect(chip).toHaveAttribute('aria-pressed', 'false')
  await chip.click()
  await expect(page).toHaveURL(/openToCollab=true/)
  // The filtered query runs as soon as the URL changes.
  await expect(chip).toHaveAttribute('aria-pressed', 'true')

  await page.reload()
  await expect(
    rail.getByRole('button', { name: 'open to collab' }),
  ).toHaveAttribute('aria-pressed', 'true')

  // Every listed builder shows a collaboration status, which is also the
  // description of its profile button.
  const rows = page
    .locator('#main-content')
    .getByRole('button', { name: /^Open .+'s profile$/ })
  await expectSettled(
    page,
    rows
      .first()
      .or(page.getByRole('heading', { name: /^no builders/ }))
      .or(page.getByRole('button', { name: 'keep looking' })),
  )
  const count = await rows.count()
  for (let index = 0; index < count; index += 1) {
    await expect(rows.nth(index)).toHaveAccessibleDescription(
      /^(open to collab|looking for cofounder|hiring \/ building a team)$/,
    )
  }
})
