import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { resolveDevelopmentFixtureIdentities } from '../development_fixture_identities'

const ids = {
  populated: 'user_pop',
  empty: 'user_empty',
  onboarding: 'user_new',
}
const users = Object.values(ids).map((id, index) => ({
  id,
  primaryEmailAddressId: `email_${index}`,
  fullName: `User ${index}`,
  imageUrl: '',
  emailAddresses: [
    {
      id: `email_${index}`,
      emailAddress: `${index}@example.test`,
      verification: { status: 'verified' },
    },
  ],
  externalAccounts: [
    {
      provider: 'oauth_github',
      providerUserId: String(index + 1),
      username: `fixture-persona-${index}`,
    },
  ],
}))
beforeEach(() =>
  vi.stubEnv('E2E_FIXTURE_CLERK_IDS', Object.values(ids).join(',')),
)
afterEach(() => vi.unstubAllEnvs())

it('maps only the exact verified primary email and connected GitHub provider identity', () => {
  expect(
    resolveDevelopmentFixtureIdentities(ids, users).populated,
  ).toMatchObject({
    clerkId: 'user_pop',
    email: '0@example.test',
    githubId: 1,
    githubUsername: 'fixture-persona-0',
  })
})
it.each(['unverified', 'wrong-user', 'no-github', 'missing-provider-id'])(
  'rejects %s Clerk data before mutation',
  (condition) => {
    const data = structuredClone(users)
    if (condition === 'unverified')
      data[0].emailAddresses[0].verification.status = 'unverified'
    if (condition === 'wrong-user') data[0].id = 'user_someone_else'
    if (condition === 'no-github') data[0].externalAccounts = []
    if (condition === 'missing-provider-id')
      data[0].externalAccounts[0].providerUserId = ''
    expect(() => resolveDevelopmentFixtureIdentities(ids, data)).toThrow()
  },
)
