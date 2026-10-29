import { convexTest } from 'convex-test'
import { makeFunctionReference } from 'convex/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import schema from './schema'

const mock = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('@clerk/backend', () => ({
  createClerkClient: () => ({ users: { getUser: mock.getUser } }),
}))
const modules = import.meta.glob('./**/*.ts')
const target = 'https://disposable-qa.convex.cloud'
const clerkIds = {
  empty: 'user_empty',
  onboarding: 'user_new',
  populated: 'user_pop',
}
const prepare = makeFunctionReference<
  'action',
  { clerkIds: typeof clerkIds; confirmTarget: string; requestKey: string },
  { status: string }
>('developmentFixtureActions:prepare')

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('E2E_FIXTURES_ENABLED', 'true')
  vi.stubEnv('E2E_FIXTURE_CONVEX_URL', target)
  vi.stubEnv('CONVEX_CLOUD_URL', target)
  vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_fixture')
  vi.stubEnv('E2E_FIXTURE_CLERK_IDS', Object.values(clerkIds).join(','))
  for (const name of [
    'EMAIL_SENDING_ENABLED',
    'EMAIL_CONTACT_SYNC_ENABLED',
    'EMAIL_TEST_SENDING_ENABLED',
  ])
    vi.stubEnv(name, 'false')
  mock.getUser.mockImplementation(async (id: string) => ({
    id,
    fullName: id,
    imageUrl: '',
    primaryEmailAddressId: id,
    emailAddresses: [
      {
        id,
        emailAddress: `${id}@example.test`,
        verification: { status: 'verified' },
      },
    ],
    externalAccounts: [
      {
        provider: 'oauth_github',
        providerUserId: String(Object.values(clerkIds).indexOf(id) + 1),
        username: id.replaceAll('_', '-'),
      },
    ],
  }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

it('maps Clerk reads by explicit role regardless of object key order', async () => {
  const t = convexTest(schema, modules)
  await t.action(prepare, {
    clerkIds,
    confirmTarget: target,
    requestKey: 'first',
  })
  const state = await t.run((ctx) =>
    ctx.db.query('development_fixture_state').unique(),
  )
  expect(state!.identities.populated.clerkId).toBe(clerkIds.populated)
  expect(state!.identities.empty.clerkId).toBe(clerkIds.empty)
})
it('checks the target before using Clerk credentials', async () => {
  const t = convexTest(schema, modules)
  await expect(
    t.action(prepare, {
      clerkIds,
      confirmTarget: 'https://wrong.convex.cloud',
      requestKey: 'first',
    }),
  ).rejects.toThrow(/target/i)
  expect(mock.getUser).not.toHaveBeenCalled()
})
