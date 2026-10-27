import type { Page } from '@playwright/test'
import { resetOnboardingPersona } from './fixtures/reset-onboarding'
import {
  currentPathname,
  gotoRetryingAbort,
  personas,
  SIGNED_OUT_STATE,
  signIn,
} from './fixtures/personas'
import {
  expect,
  expectSettled,
  requireE2EPrerequisite,
  test,
} from './fixtures/test'

// Onboarding with and without eligible builders. The
// follow step exists only when the chosen city has an eligible builder.
// Nothing is saved before "finish", so these tests walk the steps and stop
// short of it; the onboarding user stays un-onboarded for the next run.

async function chooseCity(page: Page, name: string) {
  const cityInput = page.getByRole('combobox', { name: 'city' })
  await cityInput.fill(name)
  await page
    .getByRole('listbox', { name: 'city' })
    .getByRole('option', { name: new RegExp(`^${name}\\b`, 'i') })
    .first()
    .click()
  await expect(page.getByText(/^selected: /)).toBeVisible()
}

function stepCounter(page: Page) {
  return page.getByText(/^step \d of \d$/)
}

/** Skips an optional step and waits for the next step's heading. */
async function skipStep(page: Page, nextStep: string) {
  await page.getByRole('button', { name: /^skip( for now)?$/ }).click()
  await expect(stepCounter(page)).toHaveText(nextStep)
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
}

test.describe('onboarding', () => {
  test.use({ storageState: SIGNED_OUT_STATE })

  test.beforeEach(async ({ page }) => {
    await resetOnboardingPersona()
    requireE2EPrerequisite(
      Boolean(personas.onboardingEmail),
      'needs a Clerk user that has not finished onboarding (set E2E_CLERK_ONBOARDING_USER_EMAIL)',
    )
    await page.goto('/')
    await signIn(page, personas.onboardingEmail!)
    await gotoRetryingAbort(page, '/onboarding')
    requireE2EPrerequisite(
      currentPathname(page) === '/onboarding',
      'the onboarding user has already finished onboarding; it needs a fresh Clerk and Convex user (fixtures.md)',
    )
    await expectSettled(
      page,
      page.getByRole('heading', { level: 1, name: 'where do you build?' }),
    )
  })

  test('a city with eligible builders adds a follow step that follows no one by default', async ({
    page,
  }) => {
    await chooseCity(page, personas.otherCityName)
    await expect(stepCounter(page)).toHaveText('step 1 of 5')

    await page.getByRole('button', { name: 'continue' }).click()
    await expect(stepCounter(page)).toHaveText('step 2 of 5')
    await skipStep(page, 'step 3 of 5')
    await skipStep(page, 'step 4 of 5')
    await skipStep(page, 'step 5 of 5')

    await expect(
      page.getByRole('heading', { level: 1, name: /^builders in / }),
    ).toBeFocused()
    const follows = page.getByRole('button', { name: /^follow / })
    expect(await follows.count()).toBeGreaterThan(0)
    for (const follow of await follows.all()) {
      await expect(follow).toHaveAttribute('aria-pressed', 'false')
    }
    await expect(page.getByRole('button', { name: 'finish' })).toBeEnabled()
  })

  test('a city without eligible builders ends on the repository step', async ({
    page,
  }) => {
    await chooseCity(page, personas.emptyCityName)
    await expect(stepCounter(page)).toHaveText('step 1 of 4')

    await page.getByRole('button', { name: 'continue' }).click()
    await expect(stepCounter(page)).toHaveText('step 2 of 4')
    await skipStep(page, 'step 3 of 4')
    await skipStep(page, 'step 4 of 4')

    await expect(
      page.getByRole('heading', { level: 1, name: 'pick what to show' }),
    ).toBeVisible()
    // The last step: finish (disabled until a repo is picked) and no follow
    // step after it.
    await expect(page.getByRole('button', { name: 'finish' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^follow / })).toHaveCount(0)
  })
})
