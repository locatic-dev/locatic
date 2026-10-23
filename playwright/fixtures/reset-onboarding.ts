import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { requireE2EPrerequisite } from './test'
import { personas } from './personas'

const execute = promisify(execFile)

function fixtureTarget() {
  const target = process.env.E2E_FIXTURE_CONVEX_URL
  requireE2EPrerequisite(
    process.env.E2E_RESET_FIXTURES === '1' &&
      Boolean(target && /^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(target)) &&
      target === process.env.VITE_CONVEX_URL,
    'use an explicitly enabled disposable fixture deployment (E2E_RESET_FIXTURES=1 and matching E2E_FIXTURE_CONVEX_URL/VITE_CONVEX_URL)',
  )
  return target!
}

/** Readiness is read-only; preparing/resetting the full dataset is an operator step. */
export async function verifyDevelopmentFixtureReadiness() {
  const target = fixtureTarget()
  let status: {
    status: string
    populatedUsername: string
    preparedAt: number | null
  } | null
  try {
    const { stdout } = await execute(
      'pnpm',
      [
        'exec',
        'convex',
        'run',
        'developmentFixtures:status',
        JSON.stringify({ confirmTarget: target }),
        '--codegen',
        'disable',
        '--deployment',
        new URL(target).hostname.split('.')[0],
      ],
      { timeout: 30_000, maxBuffer: 256_000 },
    )
    status = JSON.parse(stdout)
  } catch {
    throw new Error(
      'Could not inspect disposable fixture readiness; verify deployed functions, CLI credentials and fixture safety settings. No --push is performed.',
    )
  }
  requireE2EPrerequisite(
    status?.status === 'ready' &&
      status.populatedUsername === personas.publicProfileUsername &&
      status.preparedAt !== null &&
      Date.now() - status.preparedAt < 86_400_000,
    'prepare the dedicated fixture dataset within the last 24 hours and match E2E_PUBLIC_PROFILE_USERNAME',
  )
}

/** Explicitly enabled administrative fixture operation, never a public app API. */
export async function resetOnboardingPersona() {
  const target = fixtureTarget()
  requireE2EPrerequisite(
    Boolean(personas.onboardingEmail),
    'set E2E_CLERK_ONBOARDING_USER_EMAIL',
  )
  try {
    await execute(
      'pnpm',
      [
        'exec',
        'convex',
        'run',
        'developmentFixtures:resetOnboarding',
        JSON.stringify({
          confirmTarget: target,
          expectedEmail: personas.onboardingEmail,
        }),
        '--codegen',
        'disable',
        '--deployment',
        new URL(target!).hostname.split('.')[0],
      ],
      { timeout: 30_000, maxBuffer: 256_000 },
    )
  } catch {
    // CLI stderr can contain account/deployment data; keep it out of CI logs.
    throw new Error(
      'Could not reset the dedicated onboarding fixture. Check matching deployment CLI credentials, deployed fixture functions and the fixture safety configuration; no --push is performed.',
    )
  }
}
