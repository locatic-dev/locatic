import { existsSync } from 'node:fs'
import '../env'
import { test as base, expect, type Locator, type Page } from '@playwright/test'

export { expect }

/**
 * Smoke mode is an explicit opt-in for running the journeys that the current
 * deployment can support. The default release run treats every documented
 * persona and data requirement as required and fails when one is absent.
 */
export const isE2ESmokeMode = process.env.E2E_MODE === 'smoke'

/**
 * Enforces an external deployment or persona requirement. Release validation
 * fails with setup instructions; smoke mode records the same reason as a skip.
 */
export function requireE2EPrerequisite(
  condition: boolean,
  reason: string,
): void {
  if (condition) return
  if (isE2ESmokeMode) {
    test.skip(true, reason)
  }
  throw new Error(
    `E2E prerequisite missing: ${reason}\nSet E2E_MODE=smoke only for an intentionally partial local run.`,
  )
}

/**
 * How long a route may take to render. `pnpm e2e` runs against `pnpm dev`,
 * where a route's first visit compiles on demand.
 */
const SETTLE_TIMEOUT = 30_000
const APP_ERROR_TITLE = "couldn't load this page."

/** Waits for a route target and fails with the app error detail when present. */
export async function expectSettled(
  page: Page,
  target: Locator,
  { timeout = SETTLE_TIMEOUT }: { timeout?: number } = {},
) {
  const appError = page.getByText(APP_ERROR_TITLE, { exact: true })
  await expect(target.or(appError).first()).toBeVisible({ timeout })
  if (await appError.isVisible()) {
    const detail = await page.locator('main').first().innerText()
    throw new Error(`the page rendered its error state:\n${detail}`)
  }
}

/**
 * Waits until no loading placeholder is left: named/loading status regions and
 * `aria-busy` containers. A deployment or application error remains a failure.
 */
export async function expectNoPendingContent(
  page: Page,
  { timeout = SETTLE_TIMEOUT }: { timeout?: number } = {},
) {
  await expect(
    page
      .getByRole('status', { name: /^loading/i })
      .or(page.getByRole('status').filter({ hasText: /^\s*loading/i })),
  ).toHaveCount(0, { timeout })
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, {
    timeout,
  })
  await expect(
    page
      .locator('main#main-content')
      .getByRole('heading', { name: /^couldn't load / }),
  ).toHaveCount(0)
}

/** Waits for finite entrance animations before visual or contrast checks. */
export async function waitForFiniteAnimations(page: Page) {
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .every(
          (animation) =>
            animation.playState !== 'running' ||
            animation.effect?.getComputedTiming().iterations === Infinity,
        ),
    undefined,
    { timeout: 10_000 },
  )
}

/**
 * Shared Playwright test. Authenticated projects require their stored Clerk
 * session by default; smoke mode skips them when the external user is absent.
 */
export const test = base.extend({
  storageState: async ({ storageState }, use) => {
    if (typeof storageState === 'string') {
      requireE2EPrerequisite(
        Boolean(
          process.env.E2E_CLERK_USER_EMAIL &&
          process.env.CLERK_SECRET_KEY &&
          existsSync(storageState),
        ),
        'needs the populated user: set E2E_CLERK_USER_EMAIL and CLERK_SECRET_KEY in .env.local and run auth setup (playwright/fixtures/fixtures.md)',
      )
    }
    await use(storageState)
  },
})
