import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { waitForFiniteAnimations } from './fixtures/test'

/**
 * Accessibility gate for Playwright specs (plan item E3): runs axe-core on the
 * current page against WCAG 2.x A/AA rules and fails on critical and serious
 * violations. Moderate and minor findings are attached to the report instead
 * of failing, so the gate stays strict on what blocks people without turning
 * every advisory into a red build.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const BLOCKING_IMPACTS = new Set(['critical', 'serious'])

export async function expectNoSeriousA11yViolations(
  page: Page,
  options: {
    /** Selectors for third-party widgets the app cannot fix (for example Clerk). */
    exclude?: string[]
  } = {},
) {
  await waitForFiniteAnimations(page)

  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS)
  for (const selector of options.exclude ?? []) {
    builder = builder.exclude(selector)
  }

  const results = await builder.analyze()
  const blocking = results.violations.filter((violation) =>
    BLOCKING_IMPACTS.has(violation.impact ?? ''),
  )
  const advisory = results.violations.filter(
    (violation) => !BLOCKING_IMPACTS.has(violation.impact ?? ''),
  )

  if (advisory.length > 0) {
    await test.info().attach('axe-advisory', {
      body: formatViolations(advisory),
      contentType: 'text/plain',
    })
  }

  expect(blocking, formatViolations(blocking)).toEqual([])
}

type AxeViolation = Awaited<
  ReturnType<AxeBuilder['analyze']>
>['violations'][number]

function formatViolations(violations: AxeViolation[]) {
  return violations
    .map((violation) => {
      const targets = violation.nodes
        .slice(0, 5)
        .map((node) => `    ${node.target.join(' ')}`)
        .join('\n')
      return `[${violation.impact}] ${violation.id}: ${violation.help}\n${targets}`
    })
    .join('\n')
}
