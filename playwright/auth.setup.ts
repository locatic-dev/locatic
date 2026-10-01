import { expect, test as setup } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { gotoRetryingAbort, personas, signIn } from './fixtures/personas'
import { isE2ESmokeMode } from './fixtures/test'

const authFile = path.join(import.meta.dirname, '.clerk/user.json')

setup('authenticate and save Clerk storage state', async ({ page }) => {
  const missingAuth = !personas.populatedEmail || !process.env.CLERK_SECRET_KEY
  if (missingAuth && isE2ESmokeMode) {
    setup.skip(
      true,
      'set E2E_CLERK_USER_EMAIL and CLERK_SECRET_KEY in .env.local (playwright/fixtures/fixtures.md)',
    )
  }
  if (missingAuth) {
    throw new Error(
      'E2E prerequisite missing: set E2E_CLERK_USER_EMAIL and CLERK_SECRET_KEY in .env.local (playwright/fixtures/fixtures.md)',
    )
  }

  // The landing page, not /sign-in: a signed-in sign-in page navigates on
  // its own, which would abort the navigation below.
  await page.goto('/')
  await signIn(page, personas.populatedEmail!)

  await gotoRetryingAbort(page, '/home')
  await expect(page).not.toHaveURL(/\/sign-in/)
  await expect(page).toHaveURL(/\/(home|onboarding)/)

  await mkdir(path.dirname(authFile), { recursive: true })
  await page.context().storageState({ path: authFile })
})
