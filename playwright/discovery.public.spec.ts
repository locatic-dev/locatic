import type { Page } from '@playwright/test'
import {
  profileHeader,
  settledBuilderRows,
  settledProjectFeed,
} from './fixtures/explore'
import {
  currentPathname,
  personas,
  signIn,
  requireOnboardedPersona,
} from './fixtures/personas'
import {
  expect,
  expectSettled,
  requireE2EPrerequisite,
  test,
} from './fixtures/test'

// Public discovery journey (plan items C1, C4, A6, C10). Signed-out visitors
// browse Explore without being sent to sign-in, reach a builder profile, sign
// in and come back to it, follow the builder and see their work on Home. Data
// comes from the populated persona's city (playwright/fixtures/fixtures.md).

/** Home keeps the last 30 days of activity from people you follow (C5). */
const HOME_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Whether the open profile shows public work from inside the Home window: a
 * shipping log entry, or a card updated days (not months) ago.
 */
async function hasActivityWithinHomeWindow(page: Page) {
  const main = page.locator('main#main-content')
  const logTimes = await main
    .locator('time[datetime]')
    .evaluateAll((nodes) =>
      nodes.map((node) => Date.parse(node.getAttribute('datetime') ?? '')),
    )
  if (logTimes.some((time) => Date.now() - time < HOME_WINDOW_MS)) {
    return true
  }
  const recent = main.getByText(/\b(just now|\d+[mhd] ago|[1-3]w ago)\b/)
  return (await recent.count()) > 0
}

/**
 * Opens the first Explore builder profile that is not the populated user's
 * (`E2E_PUBLIC_PROFILE_USERNAME`, when set) and returns its username. Skips
 * when the deployment lists no such builder.
 */
async function openOtherBuilderProfile(page: Page) {
  const own = personas.publicProfileUsername?.toLowerCase()
  const rows = await settledBuilderRows(page)
  const candidates = Math.min(await rows.count(), 5)
  for (let index = 0; index < candidates; index += 1) {
    await rows.nth(index).click()
    await expect.poll(() => currentPathname(page)).toMatch(/^\/u\/[^/]+$/)
    const username = decodeURIComponent(
      currentPathname(page).split('/')[2] ?? '',
    )
    if (username.toLowerCase() !== own) {
      await expectSettled(page, profileHeader(page))
      return username
    }
    await page.goBack()
    await settledBuilderRows(page)
  }
  requireE2EPrerequisite(
    false,
    'needs a discoverable builder other than the populated user in the deployment (playwright/fixtures/fixtures.md)',
  )
  return ''
}

function recordNavigations(page: Page) {
  const visited: string[] = []
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      visited.push(new URL(frame.url()).pathname)
    }
  })
  return visited
}

async function openPublicExplore(page: Page, search = '') {
  await page.goto(`/explore${search}`)
  await expectSettled(
    page,
    page.getByRole('heading', { level: 1, name: 'explore' }),
  )
}

test.describe('public explore', () => {
  for (const width of [320, 390]) {
    test(`keeps builder identities readable at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 })
      await openPublicExplore(page, '?mode=builders&scope=global')
      const rows = await settledBuilderRows(page)
      requireE2EPrerequisite(
        (await rows.count()) > 0,
        'needs a public builder in Explore (playwright/fixtures/fixtures.md)',
      )
      const widths = await rows.evaluateAll((identities) =>
        identities.map(
          (identity) =>
            identity.lastElementChild?.getBoundingClientRect().width ?? 0,
        ),
      )
      expect(Math.min(...widths)).toBeGreaterThanOrEqual(120)
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
    })
  }

  test('never enters sign-in and offers sign up', async ({ page }) => {
    const visited = recordNavigations(page)
    await openPublicExplore(page)

    expect(currentPathname(page)).toBe('/explore')
    expect(visited.some((path) => path.startsWith('/sign-in'))).toBe(false)
    await expect(page.locator('main#main-content')).toBeVisible()

    const header = page.getByRole('navigation', { name: 'Site' })
    await expect(header.getByRole('link', { name: 'sign up' })).toBeVisible()
    const signInLink = header.getByRole('link', { name: 'sign in' })
    const signInUrl = new URL(
      (await signInLink.getAttribute('href')) ?? '',
      page.url(),
    )
    expect(signInUrl.pathname).toMatch(/^\/sign-in/)
    expect(signInUrl.searchParams.get('redirect')).toMatch(/^\/explore/)
  })

  test('shows personal actions as sign-in links, never as buttons', async ({
    page,
  }) => {
    await openPublicExplore(page, '?mode=builders&scope=global')

    const rows = await settledBuilderRows(page)
    requireE2EPrerequisite(
      (await rows.count()) > 0,
      'needs at least one discoverable builder in the deployment (populated persona, playwright/fixtures/fixtures.md)',
    )

    const follow = page
      .getByRole('link', { name: /^Sign in to follow / })
      .first()
    await expect(follow).toBeVisible()
    expect(
      new URL(
        (await follow.getAttribute('href')) ?? '',
        page.url(),
      ).searchParams.get('redirect'),
    ).toMatch(/^\/explore/)
    await expect(page.getByRole('button', { name: 'follow' })).toHaveCount(0)
  })

  test('keeps reaction counts at full contrast while reacting is signed-in only', async ({
    page,
  }) => {
    await openPublicExplore(page, '?scope=global')
    const projects = await settledProjectFeed(page)
    requireE2EPrerequisite(
      (await projects.count()) > 0,
      'needs a project eligible for Explore (populated persona, playwright/fixtures/fixtures.md)',
    )
    const main = page.locator('main#main-content')
    const counts = main.getByRole('button', {
      name: /^View \d+ .+ reactions?$/,
    })
    requireE2EPrerequisite(
      (await counts.count()) > 0,
      'needs an Explore project with at least one reaction (playwright/fixtures/fixtures.md)',
    )

    // A visitor cannot react, so each pill's action half is disabled and
    // faded, but its count still opens the reactor list: it must not inherit
    // the fade (opacity multiplies down the tree).
    await expect(
      main.getByRole('button', { name: /^(Add|Remove) .+ reaction$/ }).first(),
    ).toBeDisabled()
    await expect
      .poll(() =>
        counts.evaluateAll((buttons) =>
          buttons.map((button) => {
            let opacity = 1
            for (
              let element: Element | null = button;
              element;
              element = element.parentElement
            ) {
              opacity *= Number(getComputedStyle(element).opacity)
            }
            return {
              enabled: !(button as HTMLButtonElement).disabled,
              opacity,
            }
          }),
        ),
      )
      .toEqual(
        Array.from({ length: await counts.count() }, () => ({
          enabled: true,
          opacity: 1,
        })),
      )
  })

  test('visitor discovers a builder, signs in, follows them and sees their work on Home', async ({
    page,
  }) => {
    requireE2EPrerequisite(
      Boolean(personas.populatedEmail),
      'set E2E_CLERK_USER_EMAIL in .env.local (playwright/fixtures/fixtures.md)',
    )
    test.setTimeout(120_000)

    // Discover: public Explore to a builder profile, signed out. The builder
    // must be someone other than the populated user, who signs in next.
    await openPublicExplore(page, '?mode=builders&scope=global')
    const username = await openOtherBuilderProfile(page)
    const profilePath = currentPathname(page)
    const recentActivity = await hasActivityWithinHomeWindow(page)

    // Sign in from the profile and come back to it.
    const signInLink = page.getByRole('link', { name: /^sign in$/i }).first()
    await expect(signInLink).toBeVisible()
    const signInUrl = new URL(
      (await signInLink.getAttribute('href')) ?? '',
      page.url(),
    )
    expect(signInUrl.searchParams.get('redirect')).toMatch(
      new RegExp(`^${profilePath}`),
    )
    await signInLink.click()
    await expect.poll(() => currentPathname(page)).toBe('/sign-in')
    await signIn(page, personas.populatedEmail!)
    // The signed-in sign-in route resolves the destination on the next load.
    await page.reload()
    await expect
      .poll(() => currentPathname(page))
      .toMatch(new RegExp(`^(${profilePath}|/onboarding)$`))
    requireOnboardedPersona(page)
    expect(currentPathname(page)).toBe(profilePath)

    // Follow. Until the viewer bootstrap loads, the profile renders in the
    // public frame and cannot yet tell that it is the viewer's own, so it
    // offers follow; the app shell appears with the viewer. Checking for "your
    // profile" before then races it: without E2E_PUBLIC_PROFILE_USERNAME the
    // first Explore builder can be the populated user, and the test would
    // click follow on their own profile before it turns into "your profile".
    await expect(
      page.getByRole('button', { name: 'Account menu' }),
    ).toBeVisible()
    const header = profileHeader(page)
    await expectSettled(page, header)
    requireE2EPrerequisite(
      !(await header.getByRole('link', { name: 'your profile' }).isVisible()),
      'the first discoverable builder is the populated user; the journey needs another public builder in the deployment (playwright/fixtures/fixtures.md)',
    )
    const followButton = header.getByRole('button', {
      name: /^(follow|following)$/,
    })
    await expect(followButton).toBeEnabled()
    const wasFollowing =
      (await followButton.getAttribute('aria-pressed')) === 'true'
    if (wasFollowing) {
      await followButton.click()
      await expect(followButton).toHaveAttribute('aria-pressed', 'false')
    }
    await followButton.click()
    await expect(followButton).toHaveAttribute('aria-pressed', 'true')
    await expect(followButton).toHaveText('following')

    try {
      // Home: the followed builder's recent activity appears.
      requireE2EPrerequisite(
        recentActivity,
        `${username} has no public activity in the last 30 days, so Home has none of theirs to show (fixtures.md)`,
      )
      await page.goto('/home')
      await expectSettled(
        page,
        page.getByRole('heading', { level: 1, name: 'home' }),
      )
      await expect(
        page
          .locator('main#main-content')
          .locator(`a[href^="/u/${username}"]`)
          .first(),
      ).toBeVisible({ timeout: 30_000 })
    } finally {
      // Leave the populated user's follows as they were.
      if (!wasFollowing) {
        await page.goto(profilePath)
        await expectSettled(page, profileHeader(page))
        const restore = profileHeader(page).getByRole('button', {
          name: /^(follow|following)$/,
        })
        await expect(restore).toHaveAttribute('aria-pressed', 'true')
        await restore.click()
        await expect(restore).toHaveAttribute('aria-pressed', 'false')
      }
    }
  })
})
