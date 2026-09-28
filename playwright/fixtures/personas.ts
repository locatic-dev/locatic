import { clerk, clerkSetup } from '@clerk/testing/playwright'
import type { Browser, BrowserContext, Page } from '@playwright/test'
import '../env'
import { requireE2EPrerequisite } from './test'

/**
 * Personas from `fixtures.md`, read from `.env.local`. Release validation
 * requires every email/username; smoke mode may omit personas it cannot run.
 */
export const personas = {
  /** Populated user, signed in by `auth.setup.ts`. */
  populatedEmail: process.env.E2E_CLERK_USER_EMAIL,
  /** The populated user's GitHub login: a public profile with visible work. */
  publicProfileUsername: process.env.E2E_PUBLIC_PROFILE_USERNAME,
  /** Second Clerk user: onboarded into a city with no other builders. */
  emptyCityEmail: process.env.E2E_CLERK_EMPTY_CITY_USER_EMAIL,
  /** The empty-city persona's city, as the city search finds it. */
  emptyCityName: process.env.E2E_EMPTY_CITY_NAME ?? 'Mysuru',
  /** A catalogue city with public builders, for "choose another city". */
  otherCityName: process.env.E2E_OTHER_CITY_NAME ?? 'Bengaluru',
  /** Third Clerk user that has not finished onboarding. */
  onboardingEmail: process.env.E2E_CLERK_ONBOARDING_USER_EMAIL,
} as const

export const SIGNED_OUT_STATE = { cookies: [], origins: [] }

export function currentPathname(page: Page) {
  return new URL(page.url()).pathname.replace(/(.)\/$/, '$1')
}

/** Enforces that a persona expected to be onboarded has completed onboarding. */
export function requireOnboardedPersona(
  page: Page,
  who = 'the populated user',
) {
  requireE2EPrerequisite(
    currentPathname(page) !== '/onboarding',
    `${who} has not finished onboarding (playwright/fixtures/fixtures.md)`,
  )
}

/**
 * Waits for ClerkJS to load, so controls that depend on the client-side auth
 * state (Save, follow) have rendered before a spec looks for them.
 */
export async function waitForClerk(page: Page) {
  await page.waitForFunction(
    () =>
      (window as Window & { Clerk?: { loaded?: boolean } }).Clerk?.loaded ===
      true,
    undefined,
    { timeout: 30_000 },
  )
}

/**
 * `page.goto` that retries once when the page's own navigation aborts it: a
 * fresh sign-in redirects the current page, and ClerkJS in development can
 * reload the page after its handshake.
 */
export async function gotoRetryingAbort(page: Page, url: string) {
  try {
    return await page.goto(url)
  } catch (error) {
    if (!String(error).includes('net::ERR_ABORTED')) {
      throw error
    }
    return page.goto(url)
  }
}

/**
 * Signs `emailAddress` in on `page` through a Clerk sign-in token. Retries
 * once, because a dev-server reload during Clerk's load detaches
 * `window.Clerk` mid-check.
 */
export async function signIn(page: Page, emailAddress: string) {
  await clerkSetup()
  for (let attempt = 1; ; attempt += 1) {
    try {
      if (!page.url().startsWith('http')) {
        await page.goto('/')
      }
      await clerk.signIn({ page, emailAddress })
      return
    } catch (error) {
      if (attempt >= 2) {
        throw error
      }
      await page.reload()
    }
  }
}

/** A fresh signed-out context with `emailAddress` signed in. */
export async function signInFreshContext(
  browser: Browser,
  emailAddress: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: SIGNED_OUT_STATE })
  const page = await context.newPage()
  await page.goto('/')
  await signIn(page, emailAddress)
  return { context, page }
}
