import { profileHeader } from './fixtures/explore'
import { requireOnboardedPersona } from './fixtures/personas'
import {
  expect,
  expectNoPendingContent,
  expectSettled,
  requireE2EPrerequisite,
  test,
} from './fixtures/test'

test.describe('profiles for a signed-in builder (C6, C8)', () => {
  test('own profile keeps the shared section order', async ({ page }) => {
    await page.goto('/profile')
    requireOnboardedPersona(page)

    await expectSettled(page, page.getByRole('heading', { level: 1 }))
    await expectNoPendingContent(page)
    const titles = await page.evaluate(() =>
      [...document.querySelectorAll('section[aria-labelledby]')].map(
        (section) =>
          document
            .getElementById(section.getAttribute('aria-labelledby') ?? '')
            ?.textContent?.trim() ?? '',
      ),
    )
    expect(titles.slice(0, 3)).toEqual([
      'pinned',
      'recent work',
      'github contributions',
    ])
    expect(titles.at(-2)).toBe('network')
    expect(titles.at(-1)).toBe('all activity')
  })

  test('unfollow then undo restores the follow', async ({ page }) => {
    await page.goto('/profile?tab=projects&network=following')
    requireOnboardedPersona(page)

    // Persona requirement: the populated user follows at least one builder.
    const network = page.locator('#profile-network')
    const followed = network.getByRole('button', {
      name: /^Open .+'s profile$/,
    })
    await expectSettled(
      page,
      followed.first().or(network.getByRole('heading', { level: 3 })),
    )
    requireE2EPrerequisite(
      (await followed.count()) > 0,
      'the populated user follows nobody (playwright/fixtures/fixtures.md)',
    )
    await followed.first().click()
    await expect(page).toHaveURL(/\/u\//)

    const header = profileHeader(page)
    await expectSettled(page, header)
    const follow = header.getByRole('button', { name: /^(follow|following)$/ })
    // The follow state comes from users:publicProfileOverview.
    await expect(follow).toHaveAttribute('aria-pressed', 'true')
    await follow.click()
    await expect(follow).toHaveAttribute('aria-pressed', 'false')

    await page.getByRole('button', { name: 'undo' }).click()
    await expect(follow).toHaveAttribute('aria-pressed', 'true')

    // The server agrees after a reload.
    await page.reload()
    await expectSettled(page, profileHeader(page))
    await expect(follow).toHaveAttribute('aria-pressed', 'true')
  })
})
