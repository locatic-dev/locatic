import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BENGALURU,
  DAY_MS,
  NOW,
  fixtureClerkId,
  seedCity,
  seedProject,
  seedUser,
} from './__tests__/fixtures.helpers'
import { getLatestDueDigestPeriod } from './emailDigest'
import { emailRefs } from './lib/email_function_refs'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const ANCHOR = NOW - 14 * DAY_MS

afterEach(() => {
  vi.unstubAllEnvs()
})

async function configuredTest() {
  vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
  const t = convexTest(schema, modules)
  const cityId = await seedCity(t, BENGALURU)
  await seedUser(t, { username: 'admin', cityId })
  const admin = t.withIdentity({ subject: fixtureClerkId('admin') })
  await admin.mutation(emailRefs.digest.configure, {
    anchorAt: ANCHOR,
    enabled: true,
  })
  return { t, admin, cityId }
}

describe('fortnightly email digest preparation', () => {
  it('uses fixed half-open periods and creates only when a period ends', async () => {
    expect(
      getLatestDueDigestPeriod({ anchorAt: ANCHOR, now: NOW - 1 }),
    ).toBeNull()
    expect(getLatestDueDigestPeriod({ anchorAt: ANCHOR, now: NOW })).toEqual({
      key: `fortnightly:${new Date(ANCHOR).toISOString()}`,
      start: ANCHOR,
      end: NOW,
    })

    const { t } = await configuredTest()
    await expect(
      t.mutation(emailRefs.digest.prepareDue, { now: NOW - 1 }),
    ).resolves.toEqual({ status: 'not_due', campaignId: null })
    await expect(
      t.mutation(emailRefs.digest.prepareDue, { now: NOW }),
    ).resolves.toMatchObject({ status: 'created' })
  })

  it('deduplicates repeated preparation and chooses only the latest due period after downtime', async () => {
    const { t } = await configuredTest()
    const lateNow = NOW + 6 * 14 * DAY_MS
    const [first, second] = await Promise.all([
      t.mutation(emailRefs.digest.prepareDue, { now: lateNow }),
      t.mutation(emailRefs.digest.prepareDue, { now: lateNow }),
    ])
    expect([first.status, second.status].sort()).toEqual(['created', 'exists'])

    const campaigns = await t.run((ctx) =>
      ctx.db.query('email_campaigns').collect(),
    )
    expect(campaigns).toHaveLength(1)
    expect(campaigns[0]?.periodStart).toBe(NOW + 5 * 14 * DAY_MS)
    expect(campaigns[0]?.periodEnd).toBe(lateNow)
  })

  it('selects bounded live-discoverable projects and deduplicates discussion threads', async () => {
    const { t, cityId } = await configuredTest()
    const visibleOwner = await seedUser(t, { username: 'ada', cityId })
    const hiddenLocationOwner = await seedUser(t, { username: 'grace', cityId })
    const undiscoverableOwner = await seedUser(t, { username: 'linus', cityId })
    const visibleProject = await seedProject(t, {
      ownerId: visibleOwner,
      name: 'mapkit',
      lastCommitAt: NOW - DAY_MS,
    })
    await seedProject(t, {
      ownerId: hiddenLocationOwner,
      name: 'location-private',
      lastCommitAt: NOW - 2 * DAY_MS,
    })
    await seedProject(t, {
      ownerId: undiscoverableOwner,
      name: 'discovery-private',
      lastCommitAt: NOW - 3 * DAY_MS,
    })
    await t.run(async (ctx) => {
      const [hiddenLocation, undiscoverable] = await Promise.all([
        ctx.db.get(hiddenLocationOwner),
        ctx.db.get(undiscoverableOwner),
      ])
      if (!hiddenLocation || !undiscoverable) {
        throw new Error('fixture owner missing')
      }
      await ctx.db.patch(hiddenLocationOwner, {
        privacy: { ...hiddenLocation.privacy, cityVisibility: 'hidden' },
      })
      await ctx.db.patch(undiscoverableOwner, {
        appearInExplore: false,
      })
      const snapshot = {
        projectFullName: 'ada/mapkit',
        projectOwner: 'ada',
        projectRepo: 'mapkit',
        targetLabel: 'mapkit',
        updateTitle: null,
      }
      const rootId = await ctx.db.insert('comments', {
        targetType: 'project',
        targetId: String(visibleProject),
        authorId: visibleOwner,
        parentId: null,
        content: 'Private words must not become newsletter copy.',
        replyCount: 1,
        likesCount: 0,
        reactionCounts: {},
        isDeleted: false,
        authorSnapshot: {
          displayName: 'ada',
          avatarUrl: 'https://avatars.example.test/ada.png',
          cityId,
          cityName: 'Bengaluru',
        },
        targetSnapshot: snapshot,
        createdAt: NOW - 3 * DAY_MS,
      })
      await ctx.db.insert('comments', {
        targetType: 'project',
        targetId: String(visibleProject),
        authorId: visibleOwner,
        parentId: rootId,
        content: 'Another private comment body.',
        replyCount: 0,
        likesCount: 0,
        reactionCounts: {},
        isDeleted: false,
        authorSnapshot: {
          displayName: 'ada',
          avatarUrl: 'https://avatars.example.test/ada.png',
          cityId,
          cityName: 'Bengaluru',
        },
        targetSnapshot: snapshot,
        createdAt: NOW - 2 * DAY_MS,
      })
    })

    const prepared = await t.mutation(emailRefs.digest.prepareDue, { now: NOW })
    const campaign = prepared.campaignId
      ? await t.run((ctx) => ctx.db.get(prepared.campaignId!))
      : null
    expect(
      campaign?.content.projects.map((project) => project.fullName),
    ).toEqual(['ada/mapkit', 'grace/location-private'])
    expect(campaign?.content.discussions).toHaveLength(1)
    expect(campaign?.content.discussions[0]?.summary).not.toContain(
      'Private words',
    )
  })

  it('does not replace editorial changes or regenerate an existing period', async () => {
    const { t, admin } = await configuredTest()
    const prepared = await t.mutation(emailRefs.digest.prepareDue, { now: NOW })
    if (!prepared.campaignId) throw new Error('campaign was not prepared')
    const content = {
      subject: 'Edited by the operator',
      preheader: '',
      introduction: 'This edit must survive future cron invocations.',
      projects: [],
      discussions: [],
      shippingUpdate: '',
    }
    await admin.mutation(emailRefs.campaigns.saveDraft, {
      campaignId: prepared.campaignId,
      expectedRevision: 1,
      title: 'Operator edition',
      content,
    })

    await expect(
      t.mutation(emailRefs.digest.prepareDue, { now: NOW }),
    ).resolves.toEqual({ status: 'exists', campaignId: prepared.campaignId })
    const campaign = await t.run((ctx) => ctx.db.get(prepared.campaignId!))
    expect(campaign?.title).toBe('Operator edition')
    expect(campaign?.content).toEqual(content)
    expect(campaign?.revision).toBe(2)
  })
})
