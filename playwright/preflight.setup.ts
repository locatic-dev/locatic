import { expect, test as setup } from '@playwright/test'
import { settledBuilderRows } from './fixtures/explore'
import { verifyDevelopmentFixtureReadiness } from './fixtures/reset-onboarding'
import {
  expectNoPendingContent,
  expectSettled,
  isE2ESmokeMode,
} from './fixtures/test'

const REQUIRED_RELEASE_ENV = [
  'CLERK_SECRET_KEY',
  'E2E_CLERK_USER_EMAIL',
  'E2E_PUBLIC_PROFILE_USERNAME',
  'E2E_CLERK_EMPTY_CITY_USER_EMAIL',
  'E2E_CLERK_ONBOARDING_USER_EMAIL',
] as const

setup('deployment and personas are ready for e2e', async ({ page }) => {
  if (!isE2ESmokeMode) {
    const missing = REQUIRED_RELEASE_ENV.filter((name) => !process.env[name])
    expect(
      missing,
      `missing release E2E variables: ${missing.join(', ')} (playwright/fixtures/fixtures.md)`,
    ).toEqual([])
    await verifyDevelopmentFixtureReadiness()
  }

  // Public Explore exercises the branch's public discovery functions before
  // dependent projects start. A missing function, stale payload or app error
  // fails here rather than being inferred from error strings and skipped.
  await page.goto('/explore?mode=builders&scope=global')
  await expectSettled(
    page,
    page.getByRole('heading', { level: 1, name: 'explore' }),
  )
  await settledBuilderRows(page)
  await expectNoPendingContent(page)
})
