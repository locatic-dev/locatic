import { clerk, clerkSetup } from '@clerk/testing/playwright'
import { expect, test as setup } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import './env'

const authFile = path.join(import.meta.dirname, '.clerk/user.json')

setup.describe.configure({ mode: 'serial' })

setup('configure Clerk testing token', async () => {
  await clerkSetup()
})

setup('authenticate and save Clerk storage state', async ({ page }) => {
  const emailAddress = process.env.E2E_CLERK_USER_EMAIL

  if (!process.env.CLERK_SECRET_KEY) {
    throw new Error('CLERK_SECRET_KEY is required for authenticated E2E')
  }

  if (!emailAddress) {
    throw new Error('E2E_CLERK_USER_EMAIL is required for authenticated E2E')
  }

  await page.goto('/')
  await clerk.signIn({ page, emailAddress })

  await page.goto('/home')
  await expect(page).not.toHaveURL(/\/sign-in/)
  await expect(page).toHaveURL(/\/(home|onboarding)/)

  await mkdir(path.dirname(authFile), { recursive: true })
  await page.context().storageState({ path: authFile })
})
