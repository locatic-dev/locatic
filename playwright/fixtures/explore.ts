import type { Locator, Page } from '@playwright/test'
import { expect, expectSettled } from './test'

/**
 * Waits for an Explore feed to settle on `content` or its own error state
 * ("couldn't load projects."). A broken feed never reads as missing data.
 */
async function settleFeed(page: Page, content: Locator) {
  const feedError = page
    .locator('main#main-content')
    .getByRole('heading', { name: /^couldn't load / })
  await expectSettled(page, content.or(feedError).first())
  if (await feedError.isVisible()) {
    throw new Error(`the Explore feed failed: ${await feedError.innerText()}`)
  }
}

/**
 * Explore builder rows (the "Open X's profile" buttons) once the first page
 * settles. Fails when the feed renders neither rows nor its empty state, so a
 * broken page never turns into a skip. Returns no rows only for a genuinely
 * empty deployment.
 */
export async function settledBuilderRows(page: Page) {
  const main = page.locator('main#main-content')
  const rows = main.getByRole('button', { name: /^Open .+'s profile$/ })
  const empty = main.getByRole('heading', { name: /^no builders/ })
  await settleFeed(page, rows.first().or(empty))
  return rows
}

/** The identity header of a profile page (the one holding its h1). */
export function profileHeader(page: Page) {
  return page.locator('main#main-content header', {
    has: page.getByRole('heading', { level: 1 }),
  })
}

/**
 * The Explore project feed once its first page settles: project cards or an
 * empty state, never the loading skeleton.
 */
export async function settledProjectFeed(page: Page) {
  const main = page.locator('main#main-content')
  // Scoped to the results region, so rail links never count as feed rows.
  const projects = main
    .getByRole('region', { name: 'projects results' })
    .locator('a[href^="/project/"]')
  const empty = main.getByRole('heading', {
    name: /^(no projects|nothing to explore)/,
  })
  await settleFeed(page, projects.first().or(empty))
  await expect(main.getByRole('status', { name: /^loading/ })).toHaveCount(0)
  return projects
}
