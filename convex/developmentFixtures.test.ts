import { convexTest, type TestConvex } from 'convex-test'
import { makeFunctionReference } from 'convex/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import schema from './schema'
import { api } from './_generated/api'
import { seedUser, NOW } from './__tests__/fixtures.helpers'

const modules = import.meta.glob('./**/*.ts')
const TARGET = 'https://disposable-qa.convex.cloud'
const identities = {
  populated: {
    clerkId: 'user_qa_populated',
    email: 'populated@example.test',
    githubId: 101,
    githubUsername: 'qa-populated',
    displayName: 'QA Populated',
    avatarUrl: '',
  },
  empty: {
    clerkId: 'user_qa_empty',
    email: 'empty@example.test',
    githubId: 102,
    githubUsername: 'qa-empty',
    displayName: 'QA Empty',
    avatarUrl: '',
  },
  onboarding: {
    clerkId: 'user_qa_onboarding',
    email: 'onboarding@example.test',
    githubId: 103,
    githubUsername: 'qa-onboarding',
    displayName: 'QA Onboarding',
    avatarUrl: '',
  },
}
// String references allow testing new internal modules before local codegen.
const begin = makeFunctionReference<
  'mutation',
  {
    identities: typeof identities
    confirmTarget: string
    requestKey: string
    reset?: boolean
  },
  { generation: number; stage: number; status: string }
>('developmentFixtures:begin')
const step = makeFunctionReference<
  'mutation',
  { generation: number; stage: number; cursor: string | null },
  null
>('developmentFixtures:step')
const resetOnboarding = makeFunctionReference<
  'mutation',
  { confirmTarget: string; expectedEmail: string },
  null
>('developmentFixtures:resetOnboarding')

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
  vi.stubEnv('E2E_FIXTURES_ENABLED', 'true')
  vi.stubEnv('E2E_FIXTURE_CONVEX_URL', TARGET)
  vi.stubEnv('CONVEX_CLOUD_URL', TARGET)
  vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_fixture')
  vi.stubEnv(
    'E2E_FIXTURE_CLERK_IDS',
    'user_qa_populated,user_qa_empty,user_qa_onboarding',
  )
  for (const flag of [
    'EMAIL_SENDING_ENABLED',
    'EMAIL_CONTACT_SYNC_ENABLED',
    'EMAIL_TEST_SENDING_ENABLED',
  ])
    vi.stubEnv(flag, 'false')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

const args = (requestKey = 'first') => ({
  identities,
  confirmTarget: TARGET,
  requestKey,
})
type T = TestConvex<typeof schema>
async function state(t: T) {
  return await t.run((ctx) =>
    ctx.db.query('development_fixture_state').unique(),
  )
}
async function finish(t: T) {
  for (let index = 0; index < 100; index++) {
    const current = (await state(t))!
    if (current.status === 'ready') return current
    await t.mutation(step, {
      generation: current.generation,
      stage: current.stage,
      cursor: current.cursor,
    })
  }
  throw new Error('Fixture preparation did not finish')
}

it.each([
  ['E2E_FIXTURES_ENABLED', 'false', 'disabled'],
  ['CONVEX_CLOUD_URL', 'https://wrong.convex.cloud', 'target'],
  ['CLERK_SECRET_KEY', 'sk_live_unsafe', 'test'],
  ['EMAIL_SENDING_ENABLED', 'true', 'email'],
  ['EMAIL_CONTACT_SYNC_ENABLED', 'true', 'email'],
  ['EMAIL_TEST_SENDING_ENABLED', 'true', 'email'],
  ['E2E_FIXTURE_CLERK_IDS', 'user_other', 'allowlist'],
])(
  'refuses fixture preparation when %s is unsafe before changing any data',
  async (key, value, error) => {
    const t = convexTest(schema, modules)
    vi.stubEnv(key, value)
    await expect(t.mutation(begin, args())).rejects.toThrow(
      new RegExp(error, 'i'),
    )
    expect(await t.run((ctx) => ctx.db.query('users').take(1))).toEqual([])
  },
)

it('requires explicit reset for populated data and rejects a database containing any unrelated user', async () => {
  const t = convexTest(schema, modules)
  await seedUser(t, { username: 'real-member' })
  await expect(t.mutation(begin, { ...args(), reset: true })).rejects.toThrow(
    /outside.*fixture|unrelated/i,
  )
  expect(await t.run((ctx) => ctx.db.query('users').take(2))).toHaveLength(1)
})

it('prepares the complete fresh release dataset and makes repeated requests idempotent', async () => {
  const t = convexTest(schema, modules)
  const started = await t.mutation(begin, args())
  await t.mutation(begin, args())
  expect((await state(t))!.generation).toBe(started.generation)
  const ready = await finish(t)
  expect(ready.manifest).not.toBeNull()
  const manifest = ready.manifest!
  const populated = await t.run((ctx) => ctx.db.get(manifest.populatedUserId))
  expect(populated!.clerkId).toBe(identities.populated.clerkId)
  expect(populated!.stats).toMatchObject({
    projectsCount: 1,
    followingCount: 1,
    commentsCount: 1,
  })
  const empty = await t.run((ctx) => ctx.db.get(manifest.emptyUserId))
  expect(empty!.stats.projectsCount).toBe(0)
  const onboarding = await t.run((ctx) => ctx.db.get(manifest.onboardingUserId))
  expect(onboarding!.onboardingCompletedAt).toBeNull()
  const map = await t.query(api.cities.listActiveForMap, {})
  expect(map.length).toBeGreaterThanOrEqual(5)
  const home = await t
    .withIdentity({ subject: populated!.clerkId })
    .query(api.home.list, { paginationOpts: { numItems: 10, cursor: null } })
  expect(home.page.length).toBeGreaterThan(0)
  const inbox = await t.run((ctx) => ctx.db.query('conversations').take(10))
  expect(
    inbox.some(
      (row) => row.isRequest && row.lastMessage?.senderId === populated!._id,
    ),
  ).toBe(true)
  expect(inbox.some((row) => !row.isRequest)).toBe(true)
  const root = await t.run((ctx) => ctx.db.get(manifest.commentId))
  expect(root!.replyCount).toBe(1)
  await expect(t.mutation(begin, args())).resolves.toMatchObject({
    status: 'ready',
  })
  expect(await state(t)).toEqual(ready)
})

it('resets more than one page, rejects replay/stale work, and renews consumed and aged fixture data', async () => {
  const t = convexTest(schema, modules)
  await t.mutation(begin, args())
  const first = await finish(t)
  const populated = first.manifest!.populatedUserId
  await t.run(async (ctx) => {
    for (let index = 0; index < 56; index++)
      await ctx.db.insert('messages', {
        conversationId: first.manifest!.conversationId,
        senderId: populated,
        content: `dummy-${index}`,
        readAt: null,
        createdAt: NOW,
      })
    await ctx.db.patch(populated, { onboardingCompletedAt: NOW })
  })
  vi.setSystemTime(NOW + 60 * 24 * 60 * 60_000)
  await expect(t.mutation(begin, args('new'))).rejects.toThrow(/reset/i)
  await t.mutation(begin, { ...args('new'), reset: true })
  let oldJob: {
    generation: number
    stage: number
    cursor: string | null
  } | null = null
  for (let index = 0; index < 50; index++) {
    const current = (await state(t))!
    const before = await t.run((ctx) => ctx.db.query('messages').take(100))
    const job = {
      generation: current.generation,
      stage: current.stage,
      cursor: current.cursor,
    }
    await t.mutation(step, job)
    const after = await t.run((ctx) => ctx.db.query('messages').take(100))
    expect(before.length - after.length).toBeLessThanOrEqual(25)
    if (after.length < before.length) {
      const next = await state(t)
      await t.mutation(step, job)
      expect(await state(t)).toEqual(next)
      oldJob = job
      break
    }
  }
  expect(oldJob).not.toBeNull()
  await t.mutation(begin, { ...args('newer'), reset: true })
  const beforeStale = await state(t)
  await t.mutation(step, oldJob!)
  expect(await state(t)).toEqual(beforeStale)
  const ready = await finish(t)
  expect(ready.preparedAt).toBe(Date.now())
  expect(
    (await t.run((ctx) => ctx.db.query('messages').take(100))).length,
  ).toBe(2)
  expect(
    (await t.run((ctx) => ctx.db.get(ready.manifest!.onboardingUserId)))!
      .onboardingCompletedAt,
  ).toBeNull()
})

it('rechecks isolation and configuration on every reset page', async () => {
  const t = convexTest(schema, modules)
  await t.mutation(begin, args())
  const current = (await state(t))!
  await seedUser(t, { username: 'unexpected-member' })
  await expect(
    t.mutation(step, {
      generation: current.generation,
      stage: current.stage,
      cursor: current.cursor,
    }),
  ).rejects.toThrow(/outside.*fixture|unrelated/i)
  expect(await state(t)).toEqual(current)
})

it('stops an in-flight reset when fixture access is disabled', async () => {
  const t = convexTest(schema, modules)
  await t.mutation(begin, args())
  const current = (await state(t))!
  vi.stubEnv('E2E_FIXTURES_ENABLED', 'false')
  await expect(
    t.mutation(step, {
      generation: current.generation,
      stage: current.stage,
      cursor: current.cursor,
    }),
  ).rejects.toThrow(/disabled/i)
  expect(await state(t)).toEqual(current)
})

it.each([
  { githubUsername: 'locatic-qa-bob' },
  { email: 'x'.repeat(1000) + '@example.test' },
  { displayName: 'x'.repeat(1000) },
  { avatarUrl: 'x'.repeat(10000) },
])(
  'refuses oversized identities and reserved synthetic handles: %j',
  async (patch) => {
    const t = convexTest(schema, modules)
    await expect(
      t.mutation(begin, {
        ...args(),
        identities: {
          ...identities,
          populated: { ...identities.populated, ...patch },
        },
      }),
    ).rejects.toThrow(/bounded|reserved/i)
    expect(await state(t)).toBeNull()
  },
)

it('resets only the manifest’s onboarding persona, requires the exact expected email and leaves the other users alone', async () => {
  const t = convexTest(schema, modules)
  await t.mutation(begin, args())
  const ready = await finish(t)
  const onboarding = ready.manifest!.onboardingUserId
  const otherBefore = await t.run((ctx) =>
    ctx.db.get(ready.manifest!.populatedUserId),
  )
  await t.run((ctx) => ctx.db.patch(onboarding, { onboardingCompletedAt: NOW }))
  await expect(
    t.mutation(resetOnboarding, {
      confirmTarget: TARGET,
      expectedEmail: identities.populated.email,
    }),
  ).rejects.toThrow(/onboarding.*email/i)
  await t.mutation(resetOnboarding, {
    confirmTarget: TARGET,
    expectedEmail: identities.onboarding.email,
  })
  expect(
    (await t.run((ctx) => ctx.db.get(onboarding)))!.onboardingCompletedAt,
  ).toBeNull()
  expect(
    await t.run((ctx) => ctx.db.get(ready.manifest!.populatedUserId)),
  ).toEqual(otherBefore)
})
