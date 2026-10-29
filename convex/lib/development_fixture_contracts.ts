import { ConvexError, v, type Infer } from 'convex/values'

const identity = v.object({
  clerkId: v.string(),
  email: v.string(),
  githubId: v.number(),
  githubUsername: v.string(),
  displayName: v.string(),
  avatarUrl: v.string(),
})
export const fixtureIdentitiesValidator = v.object({
  populated: identity,
  empty: identity,
  onboarding: identity,
})
export type FixtureIdentities = Infer<typeof fixtureIdentitiesValidator>
export const fixtureManifestValidator = v.object({
  populatedUserId: v.id('users'),
  emptyUserId: v.id('users'),
  onboardingUserId: v.id('users'),
  projectId: v.id('projects'),
  conversationId: v.id('conversations'),
  commentId: v.id('comments'),
  projectOwner: v.string(),
  projectRepo: v.string(),
})
export const SYNTHETIC_FIXTURE_CLERK_IDS = [
  'local-fixture:bob',
  'local-fixture:carol',
  'local-fixture:hyderabad',
  'local-fixture:berlin',
  'local-fixture:sf',
  'local-fixture:ny',
] as const

/** Deliberately not part of normal auth, app startup or a public function. */
export function assertDevelopmentFixtureTarget(
  confirmTarget: string,
  identities?: FixtureIdentities,
) {
  if (process.env.E2E_FIXTURES_ENABLED !== 'true')
    throw new ConvexError('Development fixtures are disabled')
  const target = process.env.E2E_FIXTURE_CONVEX_URL
  if (
    !target ||
    target !== process.env.CONVEX_CLOUD_URL ||
    target !== confirmTarget ||
    !/^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(target)
  ) {
    throw new ConvexError(
      'Disposable fixture target must match the explicitly pinned deployment URL',
    )
  }
  if (!process.env.CLERK_SECRET_KEY?.startsWith('sk_test_'))
    throw new ConvexError('Development fixtures require a Clerk test key')
  for (const name of [
    'EMAIL_SENDING_ENABLED',
    'EMAIL_CONTACT_SYNC_ENABLED',
    'EMAIL_TEST_SENDING_ENABLED',
  ]) {
    if (process.env[name] === 'true')
      throw new ConvexError(
        'Disable all outbound email/contact sync before using fixtures',
      )
  }
  const allowed =
    process.env.E2E_FIXTURE_CLERK_IDS?.split(',').map((id) => id.trim()) ?? []
  if (
    allowed.length !== 3 ||
    new Set(allowed).size !== 3 ||
    allowed.some((id) => !/^user_[a-zA-Z0-9_]+$/.test(id))
  )
    throw new ConvexError(
      'Fixture Clerk allowlist must name exactly three distinct development users',
    )
  if (identities) {
    const rows = Object.values(identities)
    const reservedHandles = SYNTHETIC_FIXTURE_CLERK_IDS.map(
      (id) => `locatic-qa-${id.split(':')[1]}`,
    )
    if (
      rows.some(
        (row) =>
          reservedHandles.includes(row.githubUsername.toLowerCase()) ||
          row.email.length > 320 ||
          row.displayName.length > 160 ||
          row.avatarUrl.length > 2048,
      )
    )
      throw new ConvexError(
        'Fixture identities must be bounded and avoid reserved synthetic handles',
      )
    if (
      new Set(rows.map((row) => row.clerkId)).size !== 3 ||
      rows.some((row) => !allowed.includes(row.clerkId))
    )
      throw new ConvexError('Fixture identities must match the Clerk allowlist')
    if (
      new Set(rows.map((row) => row.githubId)).size !== 3 ||
      new Set(rows.map((row) => row.githubUsername.toLowerCase())).size !== 3 ||
      rows.some(
        (row) =>
          !Number.isSafeInteger(row.githubId) ||
          row.githubId <= 0 ||
          !/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(row.githubUsername) ||
          !row.email.includes('@'),
      )
    )
      throw new ConvexError(
        'Fixtures require distinct verified GitHub identities and primary emails',
      )
  }
  return {
    target,
    allowedClerkIds: [...allowed, ...SYNTHETIC_FIXTURE_CLERK_IDS],
  }
}
