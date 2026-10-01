import type { Page } from '@playwright/test'
import { requireOnboardedPersona } from './fixtures/personas'
import {
  expect,
  expectNoPendingContent,
  expectSettled,
  requireE2EPrerequisite,
  test,
} from './fixtures/test'

// Persona: the populated user in `fixtures/fixtures.md` needs at least one
// unread notification (C9).

/** Opens /notifications and waits for its first page: rows or the empty state. */
async function openNotifications(page: Page) {
  await page.goto('/notifications')
  requireOnboardedPersona(page)
  const main = page.locator('main#main-content')
  await expectSettled(
    page,
    notificationRows(page)
      .or(main.getByRole('heading', { name: 'no notifications yet' }))
      .first(),
  )
  await expectNoPendingContent(page)
  return main
}

/** Notification rows: one button each, holding the summary paragraph. */
function notificationRows(page: Page) {
  return page
    .locator('main#main-content')
    .getByRole('button')
    .filter({ has: page.locator('p') })
}

test('clicking an unread notification marks it read and opens its target', async ({
  page,
}) => {
  await openNotifications(page)

  const unreadRow = notificationRows(page)
    .filter({ has: page.locator('p', { hasText: /^unread:/ }) })
    .first()
  requireE2EPrerequisite(
    (await unreadRow.count()) > 0,
    'the populated user has no unread notification (playwright/fixtures/fixtures.md)',
  )

  // The row text without the "unread:" prefix and the relative time.
  const summary = (await unreadRow.locator('p').innerText())
    .replace(/^unread:\s*/, '')
    .trim()

  await unreadRow.click()
  // Every notification kind opens a profile, a project or a conversation.
  await expect
    .poll(() => new URL(page.url()).pathname)
    .toMatch(/^\/(u\/[^/]+|project\/[^/]+\/[^/]+|inbox)$/)

  // Reopened, the same row is announced without "unread".
  await openNotifications(page)
  const rows = notificationRows(page)
  await expect(
    rows.filter({ has: page.locator('p', { hasText: summary }) }).first(),
  ).toBeVisible()
  await expect(
    rows.filter({
      has: page.locator('p', {
        hasText: new RegExp(`^unread:\\s*${escapeRegExp(summary)}`),
      }),
    }),
  ).toHaveCount(0)
})

test('names the notifications nav item with its unread count', async ({
  page,
}) => {
  await openNotifications(page)

  const navItem = page.getByRole('link', {
    name: /^notifications(, \d+\+? unread)?$/i,
  })
  await expect(navItem.first()).toBeVisible()
})

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
