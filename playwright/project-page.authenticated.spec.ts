import type { Locator, Page } from '@playwright/test'
import { settledProjectFeed } from './fixtures/explore'
import {
  gotoRetryingAbort,
  requireOnboardedPersona,
  waitForClerk,
} from './fixtures/personas'
import {
  expect,
  expectNoPendingContent,
  expectSettled,
  requireE2EPrerequisite,
  test,
} from './fixtures/test'

// C7 project page: deleting a comment always asks first (decision D9), and
// the reaction popovers stay inside the content column on a 390px phone.
// Neither test writes data: the confirm dialog is cancelled and opening a
// popover changes nothing.

const PHONE = { width: 390, height: 844 }
const MAX_CANDIDATES = 6

function projectPath(href: string) {
  return href.split(/[?#]/)[0] ?? ''
}

/** Project paths from the user's own profile first, then from Explore. */
async function candidateProjectPaths(page: Page) {
  const paths = new Set<string>()

  await page.goto('/profile')
  requireOnboardedPersona(page)
  await expectSettled(page, page.getByRole('heading', { level: 1 }))
  await expectNoPendingContent(page)
  const main = page.locator('main#main-content')
  for (const href of await main
    .locator('a[href^="/project/"]')
    .evaluateAll((anchors) =>
      anchors.map((a) => a.getAttribute('href') ?? ''),
    )) {
    if (projectPath(href)) paths.add(projectPath(href))
  }

  if (paths.size < MAX_CANDIDATES) {
    await page.goto('/explore?scope=global')
    const links = await settledProjectFeed(page)
    for (const href of await links.evaluateAll((anchors) =>
      anchors.map((a) => a.getAttribute('href') ?? ''),
    )) {
      if (projectPath(href)) paths.add(projectPath(href))
    }
  }
  return [...paths].slice(0, MAX_CANDIDATES)
}

/** Opens a project page and waits for its content and the viewer's controls. */
async function openProject(page: Page, path: string) {
  await gotoRetryingAbort(page, path)
  await expectSettled(page, page.getByRole('heading', { level: 1 }).first())
  await expectNoPendingContent(page)
  await waitForClerk(page)
}

async function expectInside(inner: Locator, outer: Locator) {
  const [innerBox, outerBox] = await Promise.all([
    inner.boundingBox(),
    outer.boundingBox(),
  ])
  expect(innerBox).not.toBeNull()
  expect(outerBox).not.toBeNull()
  expect(innerBox!.x).toBeGreaterThanOrEqual(outerBox!.x - 0.5)
  expect(innerBox!.x + innerBox!.width).toBeLessThanOrEqual(
    outerBox!.x + outerBox!.width + 0.5,
  )
}

test('deleting a comment asks for confirmation and cancel keeps it', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const paths = await candidateProjectPaths(page)
  requireE2EPrerequisite(
    paths.length > 0,
    'populated user needs a visible project (playwright/fixtures/fixtures.md)',
  )

  let deleteButton: Locator | null = null
  for (const path of paths) {
    await openProject(page, path)
    await page.getByRole('tab', { name: /^comments \d+$/ }).click()
    const panel = page.getByRole('tabpanel', { name: /^comments/ })
    await expectSettled(
      page,
      panel
        .getByRole('article')
        .first()
        .or(panel.getByRole('heading', { name: 'no project comments yet.' })),
    )
    const candidate = panel.getByRole('button', { name: 'Delete comment' })
    if ((await candidate.count()) > 0) {
      deleteButton = candidate.first()
      break
    }
  }
  requireE2EPrerequisite(
    deleteButton !== null,
    'populated user needs a project comment of their own (playwright/fixtures/fixtures.md)',
  )

  const comment = deleteButton!.locator('xpath=ancestor::article[1]')
  const commentText = await comment.locator('p').first().innerText()

  await deleteButton!.click()
  const dialog = page.getByRole('dialog', { name: 'delete this comment?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'delete' })).toBeVisible()

  await dialog.getByRole('button', { name: 'cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(commentText).first()).toBeVisible()
})

test('reaction pills stay compact on a desktop pointer', async ({ page }) => {
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(false)
  const paths = await candidateProjectPaths(page)
  requireE2EPrerequisite(
    paths.length > 0,
    'populated user needs a visible project (playwright/fixtures/fixtures.md)',
  )
  await openProject(page, paths[0]!)

  const main = page.locator('main#main-content')
  const pill = main.locator('[data-reaction-pill]').first()
  await expect(pill).toBeVisible()
  const pillBox = await pill.boundingBox()
  expect(pillBox).not.toBeNull()
  expect(Math.abs(pillBox!.height - 28)).toBeLessThanOrEqual(1)

  const addBox = await main
    .getByRole('button', { name: 'Add project reaction' })
    .first()
    .boundingBox()
  expect(addBox).not.toBeNull()
  expect(addBox!.width).toBeLessThanOrEqual(29)
  expect(addBox!.height).toBeLessThanOrEqual(29)
})

test.describe('on a phone', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true })

  test('reaction popovers stay inside the content column', async ({ page }) => {
    const paths = await candidateProjectPaths(page)
    requireE2EPrerequisite(
      paths.length > 0,
      'populated user needs a visible project (playwright/fixtures/fixtures.md)',
    )
    await openProject(page, paths[0]!)

    const column = page.locator('.lx-page-width-detail').first()
    const addReaction = page.getByRole('button', {
      name: 'Add project reaction',
    })
    await expect(addReaction).toBeEnabled()
    await addReaction.click()
    const picker = page.getByTestId('reaction-picker')
    await expect(picker).toBeVisible()
    await expectInside(picker.locator('xpath=..'), column)
    await page.keyboard.press('Escape')

    const reactors = page
      .getByRole('button', { name: /^View \d+ .+ reactions?$/ })
      .first()
    if (await reactors.isVisible().catch(() => false)) {
      await reactors.click()
      const inspector = page.getByRole('dialog').first()
      await expect(inspector).toBeVisible()
      await expectInside(inspector, column)
    }
  })
})
