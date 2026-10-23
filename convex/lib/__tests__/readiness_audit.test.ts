import { convexTest } from 'convex-test'
import { expect, it } from 'vitest'
import schema from '../../schema'
import {
  BENGALURU,
  seedCity,
  seedProject,
  seedUser,
} from '../../__tests__/fixtures.helpers'
import { auditReadinessPage } from '../readiness_audit'

it('reports privacy/snapshot and route drift without returning user identities or content', async () => {
  const t = convexTest(schema, import.meta.glob('../../**/*.ts'))
  const city = await seedCity(t, BENGALURU),
    user = await seedUser(t, { username: 'private-person', cityId: city })
  const project = await seedProject(t, { ownerId: user, name: 'repo' })
  await t.run(async (ctx) => {
    const owner = (await ctx.db.get(user))!,
      row = (await ctx.db.get(project))!
    await ctx.db.patch(user, {
      privacy: { ...owner.privacy, cityVisibility: 'hidden' },
    })
    await ctx.db.patch(project, { github: { ...row.github, nameKey: 'wrong' } })
  })
  const report = await t.run((ctx) =>
    auditReadinessPage(ctx, { table: 'projects', cursor: null }),
  )
  expect(report.issues).toMatchObject({
    projectOwnerStateMismatch: 1,
    projectRouteKeyMismatch: 1,
  })
  expect(report.expectedCities).toEqual({})
  expect(JSON.stringify(report)).not.toContain('private-person')
  expect(JSON.stringify(report)).not.toContain('example.test')
})

it('caps each audit page and exposes a continuation instead of collecting lifetime rows', async () => {
  const t = convexTest(schema, import.meta.glob('../../**/*.ts'))
  for (let index = 0; index < 56; index++)
    await seedUser(t, { username: `person-${index}` })
  const first = await t.run((ctx) =>
    auditReadinessPage(ctx, { table: 'users', cursor: null }),
  )
  expect(first.scanned).toBe(25)
  expect(first.isDone).toBe(false)
  const second = await t.run((ctx) =>
    auditReadinessPage(ctx, { table: 'users', cursor: first.continueCursor }),
  )
  expect(second.scanned).toBe(25)
})
