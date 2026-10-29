import type { Page } from '@playwright/test'
import { settledBuilderRows } from './fixtures/explore'
import { requireOnboardedPersona } from './fixtures/personas'
import {
  expect,
  expectSettled,
  requireE2EPrerequisite,
  test,
} from './fixtures/test'

// Persona: the populated user in `fixtures/fixtures.md` needs at least one
// inbox conversation and one pending outgoing request.

function conversationRows(page: Page) {
  return page
    .getByRole('region', { name: 'conversations' })
    .getByRole('button', { name: /^open conversation with/i })
}

/**
 * The conversation open in the URL. The router writes a cleared search value
 * as the string "null", which means none.
 */
function openConversationId(page: Page) {
  const id = new URL(page.url()).searchParams.get('conversation')
  return id === null || id === 'null' ? null : id
}

/** Opens an inbox tab and waits for its list: rows or the empty state. */
async function openInbox(page: Page, tab: 'inbox' | 'requests') {
  await page.goto(`/inbox?tab=${tab}`)
  requireOnboardedPersona(page)
  const list = page.getByRole('region', { name: 'conversations' })
  await expectSettled(
    page,
    conversationRows(page)
      .first()
      .or(
        list.getByRole('heading', {
          name: /^(no conversations yet|no message requests)$/,
        }),
      ),
  )
  return list
}

test('opens a thread and returns to the list on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  const list = await openInbox(page, 'inbox')
  const message = page.getByRole('textbox', { name: 'Message' })
  const firstConversation = conversationRows(page).first()
  requireE2EPrerequisite(
    (await firstConversation.count()) > 0,
    'the populated user has no inbox conversation (playwright/fixtures/fixtures.md)',
  )

  await expect(list).toBeVisible()
  await expect(message).toBeHidden()

  await firstConversation.click()
  await expect.poll(() => openConversationId(page)).not.toBeNull()
  await expect(message).toBeVisible()
  await expect(list).toBeHidden()

  await page.getByRole('button', { name: 'back' }).click()
  await expect.poll(() => openConversationId(page)).toBeNull()
  await expect(list).toBeVisible()
  await expect(message).toBeHidden()
})

test('shows the list and the thread side by side on desktop', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openInbox(page, 'inbox')

  const firstConversation = conversationRows(page).first()
  requireE2EPrerequisite(
    (await firstConversation.count()) > 0,
    'the populated user has no inbox conversation (playwright/fixtures/fixtures.md)',
  )

  await firstConversation.click()
  await expect(
    page.getByRole('region', { name: 'conversations' }),
  ).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible()
})

test('keeps outgoing pending requests out of the requests tab', async ({
  page,
}) => {
  const requests = await openInbox(page, 'requests')
  await expect(requests.getByRole('button', { name: /, pending/ })).toHaveCount(
    0,
  )

  const list = await openInbox(page, 'inbox')
  const pending = list.getByRole('button', { name: /, pending/ })
  requireE2EPrerequisite(
    (await pending.count()) > 0,
    'the populated user has no pending outgoing request (playwright/fixtures/fixtures.md)',
  )
  await expect(pending.first()).toBeVisible()
})

/**
 * Makes the Convex query `udfPath` fail on this page while `failing.on` is
 * true, by rewriting its results on the sync WebSocket to `QueryFailed`.
 */
async function failConvexQuery(page: Page, udfPath: string) {
  const failing = { on: true }
  const queryIds = new Set<number>()
  await page.routeWebSocket(/\/api\/[^/]+\/sync$/, (socket) => {
    const server = socket.connectToServer()
    socket.onMessage((message) => {
      const data = parseJson(message)
      if (data?.type === 'ModifyQuerySet' && failing.on) {
        for (const change of data.modifications ?? []) {
          if (change.type === 'Add' && change.udfPath === udfPath) {
            queryIds.add(change.queryId)
          }
        }
      }
      server.send(message)
    })
    server.onMessage((message) => {
      const data = parseJson(message)
      if (data?.type !== 'Transition') {
        socket.send(message)
        return
      }
      data.modifications = (data.modifications ?? []).map(
        (change: { type: string; queryId: number }) =>
          change.type === 'QueryUpdated' && queryIds.delete(change.queryId)
            ? {
                type: 'QueryFailed',
                queryId: change.queryId,
                errorMessage: 'e2e: forced failure',
                logLines: [],
                journal: null,
              }
            : change,
      )
      socket.send(JSON.stringify(data))
    })
  })
  return failing
}

function parseJson(message: string | Buffer) {
  try {
    return JSON.parse(String(message))
  } catch {
    return null
  }
}

test('a failed DM open says so with a toast and retry opens the inbox', async ({
  page,
}) => {
  const failing = await failConvexQuery(page, 'conversations:findWithUser')
  await page.goto('/explore?mode=builders&scope=global')
  requireOnboardedPersona(page)

  await settledBuilderRows(page)
  const message = page
    .locator('main#main-content')
    .getByRole('button', { name: /^Message / })
    .first()
  requireE2EPrerequisite(
    (await message.count()) > 0,
    'needs a discoverable builder other than the populated user to message (playwright/fixtures/fixtures.md)',
  )

  await message.click()
  const toast = page
    .getByRole('listitem')
    .filter({ hasText: "couldn't open the conversation" })
  await expect(toast).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/explore')

  failing.on = false
  await toast.getByRole('button', { name: 'retry' }).click()
  await expect(page).toHaveURL(/\/inbox\?.*(conversation|compose)=/)
})
