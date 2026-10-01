import type { Page } from '@playwright/test'
import { settledProjectFeed } from './fixtures/explore'
import {
  gotoRetryingAbort,
  requireOnboardedPersona,
  waitForClerk,
} from './fixtures/personas'
import {
  expect,
  expectSettled,
  requireE2EPrerequisite,
  test,
} from './fixtures/test'

// D1 private saves: save a project from its page, find it on /saved, then
// remove it from /saved. The test leaves no save behind (it restores the
// starting state when the project was already saved).

/** Project paths from Explore; the viewer's own projects have no Save. */
async function exploreProjectPaths(page: Page) {
  await page.goto('/explore?scope=global')
  requireOnboardedPersona(page)
  const links = await settledProjectFeed(page)
  const hrefs = await links.evaluateAll((anchors) =>
    anchors.map((anchor) => anchor.getAttribute('href') ?? ''),
  )
  return [
    ...new Set(hrefs.map((href) => href.split(/[?#]/)[0]).filter(Boolean)),
  ].slice(0, 6)
}

test('a saved project appears on /saved and can be removed there', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const paths = await exploreProjectPaths(page)
  requireE2EPrerequisite(
    paths.length > 0,
    'Explore needs another builder’s visible project (playwright/fixtures/fixtures.md)',
  )

  let projectPath: string | null = null
  let wasSaved = false
  for (const path of paths) {
    await gotoRetryingAbort(page, path)
    await expectSettled(page, page.getByRole('heading', { level: 1 }).first())
    await waitForClerk(page)
    const toggle = page.getByRole('button', { name: /^(save|saved)$/ })
    if ((await toggle.count()) === 0) continue
    // Save waits for the viewer's saved state (projects:getSavedState).
    await expect(toggle.first()).toBeEnabled()
    wasSaved = (await toggle.first().textContent())?.trim() === 'saved'
    projectPath = path
    break
  }
  requireE2EPrerequisite(
    projectPath !== null,
    'no project on Explore offers Save: all belong to the populated user (playwright/fixtures/fixtures.md)',
  )

  if (!wasSaved) {
    await page.getByRole('button', { name: 'save', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'saved', exact: true }),
    ).toBeVisible()
  }

  await page.goto('/saved')
  await expectSettled(
    page,
    page.getByRole('heading', { level: 1, name: 'saved' }),
  )
  const card = page
    .locator('.lx-card')
    .filter({ has: page.locator(`a[href="${projectPath}"]`) })
  await expect(card).toHaveCount(1)

  if (!wasSaved) {
    await card.getByRole('button', { name: 'saved', exact: true }).click()
    await expect(card).toHaveCount(0)
  }
})
