import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'
import { fixtureClerkId, seedUser } from './__tests__/fixtures.helpers'

const modules = import.meta.glob('./**/*.ts')
const endpoints = [
  ['overview', api.users.publicProfileOverview],
  ['legacy aggregate', api.users.publicProfile],
] as const

describe.each(endpoints)('public calendar privacy: %s', (_name, endpoint) => {
  it.each([undefined, 'ada', 'bob'])(
    'withholds a populated private calendar from requester %s',
    async (requester) => {
      const t = convexTest(schema, modules)
      const ada = await seedUser(t, {
        username: 'ada',
        withContributions: true,
      })
      await seedUser(t, { username: 'bob' })
      await t.run(async (ctx) => {
        const user = await ctx.db.get(ada)
        if (!user) throw new Error('missing fixture user')
        await ctx.db.patch(ada, {
          privacy: { ...user.privacy, contributionsVisibility: 'private' },
        })
      })
      const client = requester
        ? t.withIdentity({ subject: fixtureClerkId(requester) })
        : t

      const result = await client.query(endpoint, { username: 'ada' })

      expect(result?.githubContributions).toBeNull()
      expect(result?.privacy.contributionsVisibility).toBe('private')
      const own = await t
        .withIdentity({ subject: fixtureClerkId('ada') })
        .query(api.users.privateProfileOverview, {})
      expect(own.viewer.githubContributions?.weeks.length).toBeGreaterThan(0)
    },
  )

  it('returns a public calendar without changing its data', async () => {
    const t = convexTest(schema, modules)
    const ada = await seedUser(t, { username: 'ada', withContributions: true })
    const stored = await t.run((ctx) => ctx.db.get(ada))

    expect(
      (await t.query(endpoint, { username: 'ada' }))?.githubContributions,
    ).toEqual(stored?.githubContributions)
  })
})
