// Undo send, Send later, copies, named-member audiences and bulk delete.
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import resendTest from '@convex-dev/resend/test'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  asAdmin,
  campaign,
  componentEmail,
  drain as drainScheduled,
  EMAIL_SEND_TEST_ENV,
  fireScheduledSend,
  MINUTE,
  seedAdmin,
  seedCampaign,
  seedMembers,
  sends,
  type T,
} from './__tests__/email_sends.helpers'
import {
  BENGALURU,
  fixtureClerkId,
  NOW,
  seedCity,
  seedProject,
  seedUser,
} from './__tests__/fixtures.helpers'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { SEND_DELAY_MS } from './lib/email_campaigns'
import { setEmailPreference } from './lib/email_preferences'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

function setup() {
  const t = convexTest(schema, modules)
  resendTest.register(t)
  rateLimiterTest.register(t)
  return t
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
  for (const [name, value] of Object.entries(EMAIL_SEND_TEST_ENV)) {
    vi.stubEnv(name, value)
  }
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

const drain = (t: T) => drainScheduled(t, vi)

const ARTIFACT = {
  html: '<p>Hello</p><a href="{{UNSUBSCRIBE_URL}}">Unsubscribe</a>',
  text: 'Hello\nUnsubscribe: {{UNSUBSCRIBE_URL}}',
}

async function schedule(
  t: T,
  campaignId: Id<'email_campaigns'>,
  extra: {
    expectedRevision?: number
    sendAt?: number
    copy?: 'archive' | 'me' | 'none'
  } = {},
) {
  return await asAdmin(t).mutation(internal.emailCampaigns.scheduleSend, {
    campaignId,
    expectedRevision: extra.expectedRevision ?? 3,
    ...ARTIFACT,
    copy: extra.copy ?? 'none',
    ...(extra.sendAt === undefined ? {} : { sendAt: extra.sendAt }),
  })
}

async function pendingJobs(t: T) {
  return await t.run(async (ctx) =>
    (await ctx.db.system.query('_scheduled_functions').collect()).filter(
      (job) => job.state.kind === 'pending',
    ),
  )
}

describe('undo send', () => {
  it('schedules 30 seconds out, locks the draft and can be undone', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 2)
    const campaignId = await seedCampaign(t, adminId)

    const { sendAt } = await schedule(t, campaignId)
    expect(sendAt).toBe(NOW + SEND_DELAY_MS)
    const scheduled = await campaign(t, campaignId)
    expect(scheduled).toMatchObject({ state: 'scheduled', revision: 4 })
    expect((await pendingJobs(t)).map((job) => job.name)).toEqual([
      'emailCampaigns:startScheduledSend',
    ])
    await expect(
      asAdmin(t).mutation(api.emailCampaigns.saveDraft, {
        campaignId,
        expectedRevision: 4,
        title: 'Maps',
        subject: 'Maps are live',
        preheader: '',
        content: { kind: 'announcement', body: 'Hello', cta: null },
      }),
    ).rejects.toThrow('Campaign can only be edited as a draft')

    // An Undo from a page showing an older revision is refused.
    await expect(
      asAdmin(t).mutation(api.emailCampaigns.unscheduleSend, {
        campaignId,
        expectedRevision: 3,
      }),
    ).rejects.toThrow('Campaign changed')
    await asAdmin(t).mutation(api.emailCampaigns.unscheduleSend, {
      campaignId,
      expectedRevision: 4,
    })

    const undone = await campaign(t, campaignId)
    expect(undone).toMatchObject({ state: 'draft', revision: 4 })
    expect(undone?.scheduled).toBeUndefined()
    expect(await pendingJobs(t)).toEqual([])
    await drain(t)
    expect(await sends(t, campaignId)).toEqual([])
  })

  it('refuses a request rendered before an Undo', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const campaignId = await seedCampaign(t, adminId)

    await schedule(t, campaignId)
    await asAdmin(t).mutation(api.emailCampaigns.unscheduleSend, {
      campaignId,
      expectedRevision: 4,
    })
    // A second tab rendered revision 3 before the first scheduled it.
    await expect(schedule(t, campaignId)).rejects.toThrow('Campaign changed')
    expect((await campaign(t, campaignId))?.state).toBe('draft')
  })

  it('ignores the job of an undone schedule, and refuses Undo once sending', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 1)
    const campaignId = await seedCampaign(t, adminId)

    await schedule(t, campaignId)
    const first = (await campaign(t, campaignId))!.scheduled!
    await asAdmin(t).mutation(api.emailCampaigns.unscheduleSend, {
      campaignId,
      expectedRevision: 4,
    })
    vi.setSystemTime(NOW + MINUTE)
    await schedule(t, campaignId, { expectedRevision: 4 })

    // A late run of the first job does nothing.
    await t.mutation(internal.emailCampaigns.startScheduledSend, {
      campaignId,
      scheduledAt: first.scheduledAt,
    })
    expect((await campaign(t, campaignId))?.state).toBe('scheduled')

    await fireScheduledSend(t, campaignId)
    expect((await campaign(t, campaignId))?.state).toBe('sending')
    await expect(
      asAdmin(t).mutation(api.emailCampaigns.unscheduleSend, {
        campaignId,
        expectedRevision: 5,
      }),
    ).rejects.toThrow('Already sending; it can no longer be undone')
    await drain(t)
    expect(await sends(t, campaignId)).toHaveLength(1)
  })

  it('Stop sending on a scheduled campaign returns it to draft', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const campaignId = await seedCampaign(t, adminId)

    await schedule(t, campaignId)
    await asAdmin(t).mutation(api.emailCampaigns.cancelSend, { campaignId })

    expect((await campaign(t, campaignId))?.state).toBe('draft')
    expect(await pendingJobs(t)).toEqual([])
  })
})

describe('send later', () => {
  it('accepts a time between a minute and 30 days ahead', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const campaignId = await seedCampaign(t, adminId)

    for (const sendAt of [
      NOW + 30_000,
      NOW + 31 * 24 * 60 * MINUTE,
      Number.NaN,
    ]) {
      await expect(schedule(t, campaignId, { sendAt })).rejects.toThrow(
        'Pick a time at least a minute from now and within 30 days',
      )
    }
    const sendAt = NOW + 2 * 24 * 60 * MINUTE
    await expect(schedule(t, campaignId, { sendAt })).resolves.toEqual({
      sendAt,
    })
    const [job] = await pendingJobs(t)
    expect(job?.scheduledTime).toBe(sendAt)
  })
})

describe('start checks', () => {
  async function scheduledCampaign(t: T) {
    const adminId = await seedAdmin(t)
    await seedMembers(t, 1)
    const campaignId = await seedCampaign(t, adminId)
    await schedule(t, campaignId)
    return { adminId, campaignId }
  }

  async function expectReturnedToDraft(
    t: T,
    campaignId: Id<'email_campaigns'>,
    reason: string,
  ) {
    await fireScheduledSend(t, campaignId)
    await drain(t)
    const stored = await campaign(t, campaignId)
    expect(stored).toMatchObject({
      state: 'draft',
      preparationDiagnostics: [`Not sent: ${reason}`],
    })
    expect(stored?.scheduled).toBeUndefined()
    expect(await sends(t, campaignId)).toEqual([])
  }

  it('returns to draft when sending was switched off', async () => {
    const t = setup()
    const { campaignId } = await scheduledCampaign(t)
    vi.stubEnv('EMAIL_SENDING_ENABLED', '')
    await expectReturnedToDraft(
      t,
      campaignId,
      'Email sending was turned off before the send time.',
    )
  })

  it('returns to draft when the admin who scheduled it lost access', async () => {
    const t = setup()
    const { campaignId } = await scheduledCampaign(t)
    vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('someone-else'))
    await expectReturnedToDraft(
      t,
      campaignId,
      'The admin who scheduled it no longer has access.',
    )
  })

  it('returns to draft when a digest pick went private', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 1)
    // Explore eligibility, and so a public project, needs an owner city.
    const cityId = await seedCity(t, BENGALURU)
    const ownerId = await seedUser(t, { username: 'ada', cityId })
    const projectId = await seedProject(t, { ownerId, name: 'mapkit' })
    const campaignId = await seedCampaign(t, adminId)
    await t.run((ctx) =>
      ctx.db.patch(campaignId, {
        content: {
          kind: 'digest',
          body: 'Hello',
          cta: null,
          periodKey: 'manual:x',
          periodStart: NOW,
          periodEnd: NOW,
          projects: [
            {
              projectId,
              name: 'mapkit',
              fullName: 'ada/mapkit',
              description: null,
              url: 'https://locatic.test/project/ada/mapkit',
              activityAt: NOW,
              activityLabel: 'recent',
            },
          ],
          discussions: [],
        },
      }),
    )
    await schedule(t, campaignId, { copy: 'archive' })
    await t.run(async (ctx) => {
      const project = await ctx.db.get(projectId)
      await ctx.db.patch(projectId, {
        locatic: { ...project!.locatic, isVisible: false },
      })
    })

    await expectReturnedToDraft(
      t,
      campaignId,
      'Selected project ada/mapkit is no longer public.',
    )
  })
})

describe('copies', () => {
  it('sends one copy to the archive address, not counted as a member send', async () => {
    vi.stubEnv('EMAIL_COPY_ADDRESS', 'archive@locatic.test')
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 2)
    const campaignId = await seedCampaign(t, adminId)

    await schedule(t, campaignId, { copy: 'archive' })
    expect((await campaign(t, campaignId))?.scheduled?.copyTo).toBe(
      'archive@locatic.test',
    )
    await fireScheduledSend(t, campaignId)
    await drain(t)

    const stored = await campaign(t, campaignId)
    const copy = await componentEmail(t, stored!.sent!.copyEmailId!)
    expect(copy).toMatchObject({
      to: ['archive@locatic.test'],
      subject: '[copy] Maps are live',
    })
    expect(copy?.html).toContain('https://locatic.test/settings')
    expect(copy?.html).not.toContain('{{UNSUBSCRIBE_URL}}')
    expect(await sends(t, campaignId)).toHaveLength(2)
  })

  it('defaults the archive to contact@locatic.dev, sends "me" to the admin and none on request', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const archive = await seedCampaign(t, adminId)
    const mine = await seedCampaign(t, adminId)
    const none = await seedCampaign(t, adminId)

    await schedule(t, archive, { copy: 'archive' })
    await schedule(t, mine, { copy: 'me' })
    await schedule(t, none, { copy: 'none' })

    expect((await campaign(t, archive))?.scheduled?.copyTo).toBe(
      'contact@locatic.dev',
    )
    expect((await campaign(t, mine))?.scheduled?.copyTo).toBe(
      'admin@example.test',
    )
    expect((await campaign(t, none))?.scheduled?.copyTo).toBeNull()
    await fireScheduledSend(t, none)
    expect((await campaign(t, none))?.sent?.copyEmailId).toBeUndefined()
  })

  it('cancels a waiting copy with Stop sending', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 1)
    const campaignId = await seedCampaign(t, adminId)
    await schedule(t, campaignId, { copy: 'archive' })
    await fireScheduledSend(t, campaignId)

    await asAdmin(t).mutation(api.emailCampaigns.cancelSend, { campaignId })

    const copyId = (await campaign(t, campaignId))!.sent!.copyEmailId!
    expect((await componentEmail(t, copyId))?.status).toBe('cancelled')
  })
})

describe('named members', () => {
  it('sends only to the listed members, still skipping opt-outs and deleted accounts', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    // The fourth member is not listed, so gets nothing.
    const [ada, bob, carol] = await seedMembers(t, 4)
    await t.run(async (ctx) => {
      await setEmailPreference(ctx, {
        userId: bob!,
        category: 'product_updates',
        subscribed: false,
        source: 'settings',
      })
      await ctx.db.delete(carol!)
    })
    const campaignId = await seedCampaign(t, adminId)
    await t.run((ctx) =>
      ctx.db.patch(campaignId, {
        audience: { kind: 'members', userIds: [ada!, bob!, carol!] },
      }),
    )

    const preview = await asAdmin(t).query(api.emailCampaigns.getSendPreview, {
      campaignId,
    })
    expect(preview).toMatchObject({
      estimatedCount: 1,
      capped: false,
      skipped: { unsubscribed: 1, inactive: 1, unverified: 0 },
    })

    await schedule(t, campaignId)
    await fireScheduledSend(t, campaignId)
    // One member per page, so the index cursor is exercised.
    await t.mutation(internal.emailSends.enqueueBatch, {
      campaignId,
      pageSize: 1,
    })
    await drain(t)

    expect((await sends(t, campaignId)).map((row) => row.userId)).toEqual([ada])
    expect((await campaign(t, campaignId))?.state).toBe('sent')
  })

  it('keeps members chosen before the first save and shows them on reload', async () => {
    const t = setup()
    await seedAdmin(t)
    const [ada] = await seedMembers(t, 1)

    const campaignId = await asAdmin(t).mutation(
      api.emailCampaigns.createDraft,
      {
        title: 'For Ada',
        subject: 'Hi',
        preheader: '',
        content: { kind: 'announcement', body: 'Hello', cta: null },
        audience: { kind: 'members', userIds: [ada!] },
      },
    )

    const detail = await asAdmin(t).query(api.emailCampaigns.get, {
      campaignId,
    })
    expect(detail?.audience).toEqual({
      kind: 'members',
      members: [
        {
          userId: ada,
          displayName: 'member 0',
          githubUsername: 'member0',
          skipReason: null,
        },
      ],
    })
  })

  it('refuses an empty, duplicated or oversized member list', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const [ada] = await seedMembers(t, 1)
    const campaignId = await seedCampaign(t, adminId)
    const save = (userIds: Id<'users'>[]) =>
      asAdmin(t).mutation(api.emailCampaigns.saveDraft, {
        campaignId,
        expectedRevision: 3,
        title: 'Maps',
        subject: 'Maps are live',
        preheader: '',
        content: { kind: 'announcement', body: 'Hello', cta: null },
        audience: { kind: 'members', userIds },
      })

    await expect(save([ada!, ada!])).rejects.toThrow('A member is listed twice')
    await expect(save(Array.from({ length: 51 }, () => ada!))).rejects.toThrow(
      'Choose at most 50 members',
    )
    await save([])
    await expect(
      schedule(t, campaignId, { expectedRevision: 4 }),
    ).rejects.toThrow('Choose at least one member')
  })

  it('finds members by username or name, with their skip reason', async () => {
    const t = setup()
    await seedAdmin(t)
    await seedUser(t, { username: 'ada', displayName: 'Ada Lovelace' })

    const results = await asAdmin(t).query(api.emailCampaigns.searchMembers, {
      query: '@Ada',
      kind: 'announcement',
    })
    expect(results).toEqual([
      expect.objectContaining({
        displayName: 'Ada Lovelace',
        githubUsername: 'ada',
        skipReason: 'unverified',
      }),
    ])
    const bob = await seedUser(t, { username: 'bob' })
    await t.run((ctx) => ctx.db.patch(bob, { deletedAt: NOW }))
    // Deleted accounts are left out, even on an exact username.
    await expect(
      asAdmin(t).query(api.emailCampaigns.searchMembers, {
        query: 'bob',
        kind: 'announcement',
      }),
    ).resolves.toEqual([])
    await expect(
      t
        .withIdentity({ subject: fixtureClerkId('ada') })
        .query(api.emailCampaigns.searchMembers, {
          query: 'ada',
          kind: 'announcement',
        }),
    ).rejects.toThrow('Email admin access required')
  })
})

describe('bulk delete', () => {
  it('deletes only drafts, at most 50, for admins', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedUser(t, { username: 'ada' })
    const first = await seedCampaign(t, adminId)
    const second = await seedCampaign(t, adminId)
    const sent = await seedCampaign(t, adminId)
    await t.run((ctx) => ctx.db.patch(sent, { state: 'sent' }))

    await expect(
      t
        .withIdentity({ subject: fixtureClerkId('ada') })
        .mutation(api.emailCampaigns.deleteDrafts, { campaignIds: [first] }),
    ).rejects.toThrow('Email admin access required')
    await expect(
      asAdmin(t).mutation(api.emailCampaigns.deleteDrafts, {
        campaignIds: Array.from({ length: 51 }, () => first),
      }),
    ).rejects.toThrow('Delete at most 50 drafts at a time')

    await expect(
      asAdmin(t).mutation(api.emailCampaigns.deleteDrafts, {
        campaignIds: [first, second, sent, first],
      }),
    ).resolves.toEqual({ deleted: 2 })
    expect(await campaign(t, first)).toBeNull()
    expect((await campaign(t, sent))?.state).toBe('sent')
  })
})
