// Starting a send, enqueueing in batches, size limits and recorded results.
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
  seedAdmin,
  seedCampaign,
  seedMembers,
  sends,
  startDirect,
  type T,
} from './__tests__/email_sends.helpers'
import {
  fixtureClerkId,
  NOW,
  seedProject,
  seedUser,
} from './__tests__/fixtures.helpers'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { emailBytes, LIMITS } from './lib/email_campaigns'
import { setEmailPreference } from './lib/email_preferences'
import { renderCampaignHtml, renderCampaignText } from './lib/emails/render'
import { getResend } from './lib/resend'
import { verifyUnsubscribeToken } from './lib/unsubscribe_token'
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

describe('requestSend', () => {
  it('renders, enqueues one email per eligible member and finishes', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const members = await seedMembers(t, 4)
    await t.run(async (ctx) => {
      await setEmailPreference(ctx, {
        userId: members[3]!,
        category: 'product_updates',
        subscribed: false,
        source: 'settings',
      })
    })
    const campaignId = await seedCampaign(t, adminId)

    await asAdmin(t).action(api.emailRender.requestSend, {
      campaignId,
      expectedRevision: 3,
    })
    await drain(t)

    const stored = await campaign(t, campaignId)
    expect(stored?.state).toBe('sent')
    expect(stored?.sent).toMatchObject({
      revision: 3,
      startedBy: adminId,
      enqueuedAt: expect.any(Number),
    })
    expect(stored?.sent?.html).toContain('<strong>builders</strong>')
    const rows = await sends(t, campaignId)
    expect(rows.map((row) => row.userId).sort()).toEqual(
      members.slice(0, 3).sort(),
    )
    expect(rows.every((row) => row.status === 'queued')).toBe(true)
    expect(new Set(rows.map((row) => row.emailId)).size).toBe(3)

    const email = await componentEmail(t, rows[0]!.emailId)
    expect(email?.to).toEqual([`member0@example.test`])
    expect(email?.subject).toBe('Maps are live')
    expect(email?.replyTo).toEqual(['hello@locatic.test'])
    const listUnsubscribe = email?.headers?.find(
      (header) => header.name === 'List-Unsubscribe',
    )?.value
    expect(listUnsubscribe).toMatch(
      /^<https:\/\/deployment\.convex\.site\/email\/unsubscribe\?t=.+>$/,
    )
    expect(email?.headers).toContainEqual({
      name: 'List-Unsubscribe-Post',
      value: 'List-Unsubscribe=One-Click',
    })
    const token = decodeURIComponent(
      new URL(listUnsubscribe!.slice(1, -1)).searchParams.get('t')!,
    )
    await expect(verifyUnsubscribeToken(token)).resolves.toEqual({
      userId: members[0],
      category: 'product_updates',
    })
    expect(email?.html).toContain(
      `https://locatic.test/unsubscribe?t=${encodeURIComponent(token)}`,
    )
    expect(email?.html).not.toContain('{{UNSUBSCRIBE_URL}}')
    expect(email?.text).toContain(
      `Unsubscribe: https://locatic.test/unsubscribe?t=${encodeURIComponent(token)}`,
    )
  })

  it('refuses a second start and a stale version', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 1)
    const campaignId = await seedCampaign(t, adminId)

    await expect(startDirect(t, campaignId, 2)).rejects.toThrow(
      'Campaign changed. Preview the latest version and send again.',
    )
    expect((await campaign(t, campaignId))?.state).toBe('draft')

    await asAdmin(t).action(api.emailRender.requestSend, {
      campaignId,
      expectedRevision: 3,
    })
    await expect(
      asAdmin(t).action(api.emailRender.requestSend, {
        campaignId,
        expectedRevision: 3,
      }),
    ).rejects.toThrow('Campaign is not a draft')
    await expect(startDirect(t, campaignId)).rejects.toThrow(
      'Campaign is not a draft',
    )
    await drain(t)
    expect(await sends(t, campaignId)).toHaveLength(1)
  })

  it('refuses to send when sending is off, for non-admins and for incomplete drafts', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedUser(t, { username: 'ada' })
    const campaignId = await seedCampaign(t, adminId)

    await expect(
      t
        .withIdentity({ subject: fixtureClerkId('ada') })
        .action(api.emailRender.requestSend, {
          campaignId,
          expectedRevision: 3,
        }),
    ).rejects.toThrow('Email admin access required')

    await t.run((ctx) => ctx.db.patch(campaignId, { subject: ' ' }))
    await expect(startDirect(t, campaignId)).rejects.toThrow(
      'Subject is required',
    )

    vi.stubEnv('EMAIL_SENDING_ENABLED', '')
    await expect(
      asAdmin(t).action(api.emailRender.requestSend, {
        campaignId,
        expectedRevision: 3,
      }),
    ).rejects.toThrow('Email sending is disabled in this environment')
    expect((await campaign(t, campaignId))?.state).toBe('draft')
  })

  it('rejects a digest whose selected project is no longer public', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const ownerId = await seedUser(t, { username: 'ada' })
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
    await t.run(async (ctx) => {
      const project = await ctx.db.get(projectId)
      await ctx.db.patch(projectId, {
        locatic: { ...project!.locatic, isVisible: false },
      })
    })

    await expect(startDirect(t, campaignId)).rejects.toThrow(
      'Selected project ada/mapkit is no longer public',
    )
    expect((await campaign(t, campaignId))?.state).toBe('draft')
  })
})

describe('email size and batch writes', () => {
  // Reference links expand to the full URL in both HTML and text: 1,899
  // characters of Markdown render to about 95 KB of HTML and 85 KB of text.
  const REPRO_BODY =
    '[x][a]\n\n'.repeat(60) + '[a]: https://x.dev/' + 'x'.repeat(1400)

  function limitedSetup() {
    const t = convexTest({ schema, modules, transactionLimits: true })
    resendTest.register(t)
    rateLimiterTest.register(t)
    return t
  }

  async function withBody(t: T, adminId: Id<'users'>, body: string) {
    const campaignId = await seedCampaign(t, adminId)
    await t.run((ctx) =>
      ctx.db.patch(campaignId, {
        content: { kind: 'announcement', body, cta: null },
      }),
    )
    return campaignId
  }

  it('rejects an email whose HTML and text together are too large to batch', async () => {
    const t = limitedSetup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 101)
    const campaignId = await withBody(t, adminId, REPRO_BODY)

    await expect(
      asAdmin(t).action(api.emailRender.requestSend, {
        campaignId,
        expectedRevision: 3,
      }),
    ).rejects.toThrow('Email is too large to send')
    expect((await campaign(t, campaignId))?.state).toBe('draft')
    expect(await sends(t, campaignId)).toEqual([])
  })

  it('sends the largest allowed email to 101 members within transaction limits', async () => {
    const t = limitedSetup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 101)
    // The largest body of the repro shape that the size cap still accepts.
    let links = 60
    let body = REPRO_BODY
    for (; links > 0; links -= 1) {
      body =
        '[x][a]\n\n'.repeat(links) + '[a]: https://x.dev/' + 'x'.repeat(1400)
      const props = {
        subject: 'Maps are live',
        preheader: 'See who builds near you',
        content: { kind: 'announcement' as const, body, cta: null },
        siteUrl: 'https://locatic.test',
        postalAddress: null,
      }
      const bytes = emailBytes(
        await renderCampaignHtml(props),
        await renderCampaignText(props),
      )
      if (bytes <= LIMITS.emailBytes) break
    }
    expect(links).toBeGreaterThan(30)
    const campaignId = await withBody(t, adminId, body)

    await asAdmin(t).action(api.emailRender.requestSend, {
      campaignId,
      expectedRevision: 3,
    })
    await drain(t)

    expect((await campaign(t, campaignId))?.state).toBe('sent')
    expect(await sends(t, campaignId)).toHaveLength(101)
  })
})

describe('enqueueBatch', () => {
  it.each([0, 99, 100, 101, 201])(
    'enqueues exactly %i eligible members across pages',
    async (count) => {
      const t = setup()
      const adminId = await seedAdmin(t)
      await seedMembers(t, count)
      const campaignId = await seedCampaign(t, adminId)

      await startDirect(t, campaignId)
      await drain(t)

      expect(await sends(t, campaignId)).toHaveLength(count)
      expect((await campaign(t, campaignId))?.state).toBe('sent')
    },
  )

  it('pages with a small batch size and skips an all-ineligible page', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const members = await seedMembers(t, 20)
    await t.run(async (ctx) => {
      for (const userId of members.slice(0, 8)) {
        await ctx.db.patch(userId, { emailVerified: false })
      }
    })
    const campaignId = await seedCampaign(t, adminId)

    await startDirect(t, campaignId)
    await t.run((ctx) =>
      ctx.scheduler.runAfter(0, internal.emailSends.enqueueBatch, {
        campaignId,
        pageSize: 7,
      }),
    )
    await drain(t)

    expect(await sends(t, campaignId)).toHaveLength(12)
  })

  it('never sends twice when a batch runs again from the same cursor', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 5)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)

    // Two overlapping chains from the same stored cursor (a Resume racing
    // a delayed batch).
    await t.mutation(internal.emailSends.enqueueBatch, {
      campaignId,
      pageSize: 3,
    })
    await t.run(async (ctx) =>
      ctx.db.patch(campaignId, {
        state: 'sending',
        sent: { ...(await ctx.db.get(campaignId))!.sent!, cursor: null },
      }),
    )
    await t.mutation(internal.emailSends.enqueueBatch, {
      campaignId,
      pageSize: 3,
    })
    await drain(t)

    const rows = await sends(t, campaignId)
    expect(rows).toHaveLength(5)
    const email = await componentEmail(t, rows[0]!.emailId)
    expect(email).toMatchObject({
      idempotencyKey: `campaign:${campaignId}:user:${rows[0]!.userId}`,
    })
  })

  it('does not revisit members behind the cursor and includes new members ahead of it', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const members = await seedMembers(t, 4)
    await t.run((ctx) => ctx.db.patch(members[0]!, { emailVerified: false }))
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await t.run(async (ctx) => {
      const scheduled = await ctx.db.system
        .query('_scheduled_functions')
        .collect()
      for (const job of scheduled) {
        if (job.state.kind === 'pending') await ctx.scheduler.cancel(job._id)
      }
    })

    await t.mutation(internal.emailSends.enqueueBatch, {
      campaignId,
      pageSize: 3,
    })
    // Verified after the scan passed them: not revisited.
    await t.run((ctx) => ctx.db.patch(members[0]!, { emailVerified: true }))
    const late = await seedMembers(t, 1, 'late')
    await t.mutation(internal.emailSends.enqueueBatch, {
      campaignId,
      pageSize: 3,
    })
    await drain(t)

    const recipients = (await sends(t, campaignId)).map((row) => row.userId)
    expect(recipients).not.toContain(members[0])
    expect(recipients).toContain(late[0])
    expect((await campaign(t, campaignId))?.state).toBe('sent')
  })

  it('skips a member who opts out between batches', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const members = await seedMembers(t, 3)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await t.run(async (ctx) => {
      for (const job of await ctx.db.system
        .query('_scheduled_functions')
        .collect()) {
        if (job.state.kind === 'pending') await ctx.scheduler.cancel(job._id)
      }
    })

    await t.mutation(internal.emailSends.enqueueBatch, {
      campaignId,
      pageSize: 2,
    })
    await t.run((ctx) =>
      setEmailPreference(ctx, {
        userId: members[2]!,
        category: 'product_updates',
        subscribed: false,
        source: 'one_click',
      }),
    )
    await t.mutation(internal.emailSends.enqueueBatch, {
      campaignId,
      pageSize: 2,
    })
    await drain(t)

    const recipients = (await sends(t, campaignId)).map((row) => row.userId)
    expect(recipients).toEqual([members[0], members[1]])
  })

  it('commits the component email and the send row together or not at all', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const [member] = await seedMembers(t, 1)
    const campaignId = await seedCampaign(t, adminId)

    let emailId: string | null = null
    await expect(
      t.run(async (ctx) => {
        emailId = await getResend().sendEmail(ctx, {
          from: 'Locatic <updates@locatic.test>',
          to: 'member0@example.test',
          subject: 'x',
          html: '<p>x</p>',
        })
        await ctx.db.insert('email_sends', {
          campaignId,
          userId: member!,
          category: 'product_updates',
          emailId,
          status: 'queued',
          createdAt: NOW,
          updatedAt: NOW,
        })
        throw new Error('forced failure after enqueue')
      }),
    ).rejects.toThrow('forced failure after enqueue')

    expect(await sends(t, campaignId)).toEqual([])
    expect(emailId).not.toBeNull()
    expect(await componentEmail(t, emailId!)).toBeNull()
  })
})

describe('campaign results', () => {
  it('marks the list total as capped past 100 recipients', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 101)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)

    const [summary] = await asAdmin(t).query(api.emailCampaigns.list, {})
    expect(summary?.results).toEqual({
      total: { count: 100, capped: true },
      delivered: { count: 0, capped: false },
    })
    const detail = await asAdmin(t).query(api.emailCampaigns.get, {
      campaignId,
    })
    expect(detail?.results?.counts.queued).toEqual({
      count: 101,
      capped: false,
    })
  })

  it('counts sends by status and lists recipients without addresses', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 3)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)
    const rows = await sends(t, campaignId)
    await t.run((ctx) => ctx.db.patch(rows[0]!._id, { status: 'delivered' }))

    const detail = await asAdmin(t).query(api.emailCampaigns.get, {
      campaignId,
    })
    const exact = (count: number) => ({ count, capped: false })
    expect(detail?.results).toEqual({
      counts: {
        queued: exact(2),
        sent: exact(0),
        delivered: exact(1),
        bounced: exact(0),
        complained: exact(0),
        failed: exact(0),
        cancelled: exact(0),
      },
      total: exact(3),
    })

    const [summary] = await asAdmin(t).query(api.emailCampaigns.list, {})
    expect(summary).toMatchObject({
      id: campaignId,
      state: 'sent',
      results: { total: exact(3), delivered: exact(1) },
    })

    const page = await asAdmin(t).query(api.emailCampaigns.listRecipients, {
      campaignId,
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(page.page).toHaveLength(3)
    expect(page.page[0]).toEqual({
      id: expect.any(String),
      displayName: expect.any(String),
      githubUsername: expect.any(String),
      status: expect.any(String),
      updatedAt: expect.any(Number),
    })
    expect(JSON.stringify(page)).not.toContain('@example.test')
  })
})
