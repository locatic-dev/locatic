import type { Page } from '@playwright/test'
import { personas } from './fixtures/personas'
import {
  expect,
  expectSettled,
  requireE2EPrerequisite,
  test,
} from './fixtures/test'

// A public profile to visit signed out. Persona requirement (fixtures.md):
// the populated user's GitHub username, with at least one visible project.
// Screenshot baselines live in visual.public.spec.ts.
const PROFILE_USERNAME = personas.publicProfileUsername

const SECTION_ORDER = [
  'pinned',
  'recent work',
  'shipping log',
  'github contributions',
  'languages',
  'network',
  'all activity',
]

/** Labelled profile sections in document order. */
async function sectionTitles(page: Page) {
  return await page.evaluate(() =>
    [...document.querySelectorAll('section[aria-labelledby]')].map(
      (section) =>
        document
          .getElementById(section.getAttribute('aria-labelledby') ?? '')
          ?.textContent?.trim() ?? '',
    ),
  )
}

/** The first project or post card in pinned, else recent work. */
function firstShowcaseItem(page: Page) {
  return page
    .locator('#profile-pinned, #profile-recent-work')
    .first()
    .locator(':scope > div')
    .nth(1)
}

test.describe('public profile (C6)', () => {
  test.beforeEach(() => {
    requireE2EPrerequisite(
      Boolean(PROFILE_USERNAME),
      'set E2E_PUBLIC_PROFILE_USERNAME to a public profile with visible work (see playwright/fixtures/fixtures.md)',
    )
  })

  test('renders identity, a sign-up CTA and the sections in order', async ({
    page,
  }) => {
    await page.goto(`/u/${PROFILE_USERNAME}`)

    const main = page.locator('main#main-content')
    await expectSettled(page, main.getByRole('heading', { level: 1 }))
    const signUp = main.getByRole('link', { name: 'sign up to follow' })
    await expect(signUp).toBeVisible()
    await expect(signUp).toHaveAttribute(
      'href',
      new RegExp(`redirect=%2Fu%2F${PROFILE_USERNAME}`),
    )
    await expect(main.getByRole('button', { name: 'follow' })).toHaveCount(0)

    const titles = await sectionTitles(page)
    expect(titles).toEqual(
      SECTION_ORDER.filter((title) => titles.includes(title)),
    )
    expect(titles).toContain('recent work')
  })

  test('keeps pins and recent work above the fold at 390x844 without overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/u/${PROFILE_USERNAME}`)

    const item = firstShowcaseItem(page)
    await expectSettled(page, item)
    const box = await item.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeLessThan(844)

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('lists the shipping log newest first, or renders no empty block', async ({
    page,
  }) => {
    await page.goto(`/u/${PROFILE_USERNAME}`)
    const main = page.locator('main#main-content')
    await expectSettled(page, main.getByRole('heading', { level: 1 }))

    // Server-rendered with the overview (D6): present only when the builder
    // has public releases or posts.
    const log = main.getByRole('region', { name: 'shipping log' })
    if ((await log.count()) === 0) {
      await expect(main.getByText('shipping log', { exact: true })).toHaveCount(
        0,
      )
      return
    }

    const rows = log.getByRole('listitem')
    await expect(rows.first()).toBeVisible()
    const times = await log
      .locator('time')
      .evaluateAll((nodes) =>
        nodes.map((node) => Date.parse(node.getAttribute('datetime') ?? '')),
      )
    expect(times.length).toBeGreaterThan(0)
    expect(times.length).toBeLessThanOrEqual(10)
    expect(times).toEqual([...times].sort((left, right) => right - left))
    await expect(
      rows.first().getByRole('link', { name: /\// }),
    ).toHaveAttribute('href', /^\/project\//)
  })
})

test('a missing builder is a 404 inside the public shell', async ({ page }) => {
  const response = await page.goto('/u/no-such-builder-e2e-404')

  expect(response?.status()).toBe(404)
  const main = page.locator('main#main-content')
  await expect(
    main.getByRole('heading', { level: 1, name: 'builder not found' }),
  ).toBeVisible()
  await expect(
    main.getByRole('link', { name: 'explore builders' }),
  ).toBeVisible()
})
