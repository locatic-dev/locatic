import type { Page } from '@playwright/test'
import { expect, expectNoPendingContent, waitForFiniteAnimations } from './test'

/** Baseline viewports: desktop and a 390px phone. */
export const BASELINE_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const

/** `relativeTime()` copy ("just now", "3d ago", "2mo ago"). */
const RELATIVE_TIME = /\b(just now|\d+(m|h|d|w|mo) ago)\b/

/**
 * Live content that changes without a code change: timestamps, relative
 * times and graphs of activity. Masked so a baseline diff means the layout
 * or styling moved.
 */
function liveContent(page: Page) {
  return [
    page.locator('time'),
    page.getByText(RELATIVE_TIME),
    page.getByRole('region', { name: 'GitHub contribution graph' }),
    page.getByRole('img', { name: /^map of / }),
  ]
}

/**
 * Compares the viewport with `<name>-<width>.png`. Call after the route's
 * content has rendered; this also waits out loading skeletons, web fonts and
 * images, so a baseline never captures a loading state.
 */
export async function expectBaseline(
  page: Page,
  name: string,
  { mask = [] }: { mask?: string[] } = {},
) {
  if (!process.env.E2E_PRIVATE_BASELINE_DIR)
    throw new Error(
      'Provider-backed baselines require E2E_PRIVATE_BASELINE_DIR outside the repository. Use pnpm e2e:components for committed synthetic baselines.',
    )
  await expectNoPendingContent(page)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() =>
    [...document.images].every((image) => image.complete),
  )
  await waitForFiniteAnimations(page)
  const width = page.viewportSize()?.width ?? 0
  await expect(page).toHaveScreenshot(`${name}-${width}.png`, {
    mask: [
      ...liveContent(page),
      ...mask.map((selector) => page.locator(selector)),
    ],
  })
}
