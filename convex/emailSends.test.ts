import rateLimiterTest from '@convex-dev/rate-limiter/test'
import type { EmailId } from '@convex-dev/resend'
import resendTest from '@convex-dev/resend/test'
import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fixtureClerkId,
  NOW,
  seedProject,
  seedUser,
} from './__tests__/fixtures.helpers'
import { api, components, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { emailBytes, LIMITS } from './lib/email_campaigns'
import { setEmailPreference } from './lib/email_preferences'
import { renderCampaignHtml, renderCampaignText } from './lib/emails/render'
import { getResend } from './lib/resend'
import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from './lib/unsubscribe_token'
import { createDefaultViewerProfile } from './lib/viewer'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const MINUTE = 60_000

type T = TestConvex<typeof schema>

function setup() {
  const t = convexTest(schema, modules)
  resendTest.register(t)
  rateLimiterTest.register(t)
  return t
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
  vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
  vi.stubEnv('EMAIL_SENDING_ENABLED', 'true')
  vi.stubEnv('EMAIL_TEST_SENDING_ENABLED', '')
  vi.stubEnv('EMAIL_FROM', 'Locatic <updates@locatic.test>')
  vi.stubEnv('EMAIL_REPLY_TO', 'hello@locatic.test')
  vi.stubEnv('SITE_URL', 'https://locatic.test')
  vi.stubEnv('CONVEX_SITE_URL', 'https://deployment.convex.site')
  vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', 'secret')
  vi.stubEnv('RESEND_API_KEY', 're_test_key')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

// Runs our zero-delay scheduled chain (batches, cancellations) without
// firing the component's own delayed batch worker, which needs nested
// workpool components that the test registration does not include.
async function drain(t: T) {
  await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(0))
}

async function seedAdmin(t: T) {
  return await seedUser(t, { username: 'admin' })
}

async function seedMembers(t: T, count: number, prefix = 'member') {
  return await t.run(async (ctx) => {
    const ids: Id<'users'>[] = []
    for (let index = 0; index < count; index += 1) {
      ids.push(
        await ctx.db.insert('users', {
          ...createDefaultViewerProfile({
            clerkId: `${prefix}_${index}`,
            email: `${prefix}${index}@example.test`,
            githubId: null,
            githubUsername: `${prefix}${index}`,
            githubUrl: `https://github.com/${prefix}${index}`,
            avatarUrl: '',
            displayName: `${prefix} ${index}`,
          }),
          emailVerified: true,
        }),
      )
    }
    return ids
  })
}

async function seedCampaign(t: T, adminId: Id<'users'>) {
  return await t.run((ctx) =>
    ctx.db.insert('email_campaigns', {
      title: 'Maps',
      subject: 'Maps are live',
      preheader: 'See who builds near you',
      revision: 3,
      templateVersion: 2,
      state: 'draft',
      content: { kind: 'announcement', body: 'Hello **builders**', cta: null },
      preparationDiagnostics: [],
      createdBy: adminId,
      updatedBy: adminId,
      createdAt: NOW,
      updatedAt: NOW,
    }),
  )
}

function asAdmin(t: T) {
  return t.withIdentity({ subject: fixtureClerkId('admin') })
}

async function sends(t: T, campaignId: Id<'email_campaigns'>) {
  return await t.run((ctx) =>
    ctx.db
      .query('email_sends')
      .withIndex('by_campaign_and_user', (q) => q.eq('campaignId', campaignId))
      .collect(),
  )
}

async function campaign(t: T, campaignId: Id<'email_campaigns'>) {
  return await t.run((ctx) => ctx.db.get(campaignId))
}

async function startDirect(
  t: T,
  campaignId: Id<'email_campaigns'>,
  revision = 3,
) {
  // The action renders; these tests exercise the transaction behind it.
  await asAdmin(t).mutation(internal.emailCampaigns.startSend, {
    campaignId,
    expectedRevision: revision,
    html: '<p>Hello</p><a href="{{UNSUBSCRIBE_URL}}">Unsubscribe</a>',
    text: 'Hello\nUnsubscribe: {{UNSUBSCRIBE_URL}}',
  })
}

async function componentEmail(t: T, emailId: string) {
  return await t.run((ctx) => getResend().get(ctx, emailId as EmailId))
}

async function setComponentStatus(
  t: T,
  emailId: string,
  status: 'sent' | 'failed' | 'delivered' | 'bounced' | 'queued',
  errorMessage?: string,
) {
  await t.run((ctx) =>
    ctx.runMutation(components.resend.lib.updateManualEmail, {
      emailId,
      status,
      ...(errorMessage ? { errorMessage } : {}),
    }),
  )
}

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

describe('cancelling', () => {
  async function stopChain(t: T) {
    await t.run(async (ctx) => {
      for (const job of await ctx.db.system
        .query('_scheduled_functions')
        .collect()) {
        if (job.state.kind === 'pending') await ctx.scheduler.cancel(job._id)
      }
    })
  }

  it('stops further batches and cancels waiting emails', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 3)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await stopChain(t)
    // The admin (unverified) and the first member.
    await t.mutation(internal.emailSends.enqueueBatch, {
      campaignId,
      pageSize: 2,
    })
    await stopChain(t)

    await asAdmin(t).mutation(api.emailCampaigns.cancelSend, { campaignId })
    await drain(t)

    expect((await campaign(t, campaignId))?.state).toBe('cancelled')
    const rows = await sends(t, campaignId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('cancelled')
    expect((await componentEmail(t, rows[0]!.emailId))?.status).toBe(
      'cancelled',
    )

    // Batches that were already scheduled stop at the state check.
    await t.mutation(internal.emailSends.enqueueBatch, { campaignId })
    expect(await sends(t, campaignId)).toHaveLength(1)
  })

  it('leaves emails already handed to Resend alone and never throws', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const [member] = await seedMembers(t, 2)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)
    const rows = await sends(t, campaignId)
    const own = rows.find((row) => row.userId === member)!
    await setComponentStatus(t, own.emailId, 'sent')

    await t.mutation(internal.emailSends.cancelWaitingSends, {
      userId: member,
    })
    await t.mutation(internal.emailSends.cancelWaitingSends, { campaignId })

    const after = await sends(t, campaignId)
    expect(after.find((row) => row.userId === member)?.status).toBe('queued')
    expect(after.find((row) => row.userId !== member)?.status).toBe('cancelled')
  })

  it('cancels a member’s waiting emails when they opt out', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const [member] = await seedMembers(t, 1)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)

    await t.run((ctx) =>
      setEmailPreference(ctx, {
        userId: member!,
        category: 'product_updates',
        subscribed: false,
        source: 'unsubscribe_link',
      }),
    )
    await drain(t)

    expect((await sends(t, campaignId))[0]?.status).toBe('cancelled')
  })

  it('refuses to cancel a draft', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const campaignId = await seedCampaign(t, adminId)
    await expect(
      asAdmin(t).mutation(api.emailCampaigns.cancelSend, { campaignId }),
    ).rejects.toThrow('Only a campaign that is sending can be cancelled')
  })
})

describe('cancellation scope', () => {
  async function seedDigest(t: T, adminId: Id<'users'>) {
    const campaignId = await seedCampaign(t, adminId)
    await t.run((ctx) =>
      ctx.db.patch(campaignId, {
        content: {
          kind: 'digest',
          body: 'Digest',
          cta: null,
          periodKey: 'manual:x',
          periodStart: NOW,
          periodEnd: NOW,
          projects: [],
          discussions: [],
        },
      }),
    )
    return campaignId
  }

  async function bothWaiting(t: T) {
    const adminId = await seedAdmin(t)
    const [member] = await seedMembers(t, 1)
    await t.run((ctx) =>
      setEmailPreference(ctx, {
        userId: member!,
        category: 'weekly_digest',
        subscribed: true,
        source: 'settings',
      }),
    )
    const update = await seedCampaign(t, adminId)
    const digest = await seedDigest(t, adminId)
    await startDirect(t, update)
    await startDirect(t, digest)
    await drain(t)
    return { member: member!, update, digest }
  }

  it('cancels only the category the member turned off', async () => {
    const t = setup()
    const { member, update, digest } = await bothWaiting(t)
    expect((await sends(t, update))[0]?.category).toBe('product_updates')
    expect((await sends(t, digest))[0]?.category).toBe('weekly_digest')

    await t.run((ctx) =>
      setEmailPreference(ctx, {
        userId: member,
        category: 'product_updates',
        subscribed: false,
        source: 'settings',
      }),
    )
    await drain(t)

    expect((await sends(t, update))[0]?.status).toBe('cancelled')
    expect((await sends(t, digest))[0]?.status).toBe('queued')
  })

  it('cancels both categories on Stop all', async () => {
    const t = setup()
    vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', 'secret')
    const { member, update, digest } = await bothWaiting(t)
    const token = await signUnsubscribeToken(member, 'product_updates')

    await t.mutation(api.emailPreferences.stopAllWithToken, { token })
    await drain(t)

    expect((await sends(t, update))[0]?.status).toBe('cancelled')
    expect((await sends(t, digest))[0]?.status).toBe('cancelled')
  })

  it('cancels everything waiting when the account is deactivated', async () => {
    const t = setup()
    const { member, update, digest } = await bothWaiting(t)
    await t.run((ctx) =>
      ctx.scheduler.runAfter(0, internal.emailSends.cancelWaitingSends, {
        userId: member,
        before: Date.now(),
      }),
    )
    await drain(t)

    expect((await sends(t, update))[0]?.status).toBe('cancelled')
    expect((await sends(t, digest))[0]?.status).toBe('cancelled')
  })

  it('leaves sends created after an opt-out was undone alone', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const [member] = await seedMembers(t, 1)
    // Opt out: the cancellation job is scheduled but has not run yet.
    await t.run((ctx) =>
      setEmailPreference(ctx, {
        userId: member!,
        category: 'product_updates',
        subscribed: false,
        source: 'settings',
      }),
    )
    vi.setSystemTime(NOW + MINUTE)
    await t.run((ctx) =>
      setEmailPreference(ctx, {
        userId: member!,
        category: 'product_updates',
        subscribed: true,
        source: 'settings',
      }),
    )
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await t.mutation(internal.emailSends.enqueueBatch, { campaignId })

    await drain(t)

    expect((await sends(t, campaignId))[0]?.status).toBe('queued')
  })

  it('leaves sends to a new address alone when the old job runs late', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const cyd = await seedUser(t, { username: 'cyd' })
    await t.run((ctx) => ctx.db.patch(cyd, { emailVerified: true }))
    await t.mutation(internal.users.upsertFromClerkWebhook, {
      clerkId: fixtureClerkId('cyd'),
      email: 'cyd@new.example.test',
      githubId: null,
      githubUsername: 'cyd',
      githubUrl: 'https://github.com/cyd',
      displayName: 'cyd',
      avatarUrl: '',
      emailVerified: true,
    })
    vi.setSystemTime(NOW + MINUTE)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await t.mutation(internal.emailSends.enqueueBatch, { campaignId })

    await drain(t)

    const [row] = await sends(t, campaignId)
    expect(row?.userId).toBe(cyd)
    expect(row?.status).toBe('queued')
  })
})

describe('emergency stop', () => {
  it('stops at the next batch when sending is switched off, and resumes once it is back on', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 5)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await t.run(async (ctx) => {
      for (const job of await ctx.db.system
        .query('_scheduled_functions')
        .collect()) {
        if (job.state.kind === 'pending') await ctx.scheduler.cancel(job._id)
      }
    })
    // The admin and two members.
    await t.mutation(internal.emailSends.enqueueBatch, {
      campaignId,
      pageSize: 3,
    })
    const pendingBatches = async () =>
      (
        await t.run((ctx) =>
          ctx.db.system.query('_scheduled_functions').collect(),
        )
      ).filter(
        (job) =>
          job.state.kind === 'pending' &&
          job.name === 'emailSends:enqueueBatch',
      )
    expect(await pendingBatches()).toHaveLength(1)

    vi.stubEnv('EMAIL_SENDING_ENABLED', '')
    await drain(t)

    expect((await campaign(t, campaignId))?.state).toBe('sending')
    expect(await sends(t, campaignId)).toHaveLength(2)
    expect(await pendingBatches()).toHaveLength(0)
    // Waiting emails are left for the admin to cancel.
    expect(
      (await sends(t, campaignId)).every((row) => row.status === 'queued'),
    ).toBe(true)

    vi.setSystemTime(NOW + 6 * MINUTE)
    await expect(
      asAdmin(t).mutation(api.emailCampaigns.resumeSend, { campaignId }),
    ).rejects.toThrow('Email sending is disabled in this environment')

    vi.stubEnv('EMAIL_SENDING_ENABLED', 'true')
    await asAdmin(t).mutation(api.emailCampaigns.resumeSend, { campaignId })
    await drain(t)

    expect((await campaign(t, campaignId))?.state).toBe('sent')
    expect(await sends(t, campaignId)).toHaveLength(5)
  })
})

describe('resumeSend', () => {
  it('resumes a stalled send from the stored cursor only after five minutes', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 3)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    // The chain died: nothing scheduled.
    await t.run(async (ctx) => {
      for (const job of await ctx.db.system
        .query('_scheduled_functions')
        .collect()) {
        if (job.state.kind === 'pending') await ctx.scheduler.cancel(job._id)
      }
    })

    vi.setSystemTime(NOW + MINUTE)
    await expect(
      asAdmin(t).mutation(api.emailCampaigns.resumeSend, { campaignId }),
    ).rejects.toThrow('Sending is still in progress')

    vi.setSystemTime(NOW + 6 * MINUTE)
    await asAdmin(t).mutation(api.emailCampaigns.resumeSend, { campaignId })
    await drain(t)

    expect(await sends(t, campaignId)).toHaveLength(3)
    expect((await campaign(t, campaignId))?.state).toBe('sent')
  })
})

describe('campaign results', () => {
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
    expect(detail?.results).toEqual({
      counts: {
        queued: 2,
        sent: 0,
        delivered: 1,
        bounced: 0,
        complained: 0,
        failed: 0,
        cancelled: 0,
      },
      total: 3,
      capped: false,
    })

    const [summary] = await asAdmin(t).query(api.emailCampaigns.list, {})
    expect(summary).toMatchObject({
      id: campaignId,
      state: 'sent',
      results: { total: 3, delivered: 1, capped: false },
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

describe('account changes', () => {
  it('cancels waiting sends on deactivation, deletion and address change', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const ada = await seedUser(t, { username: 'ada' })
    const bob = await seedUser(t, { username: 'bob' })
    const cyd = await seedUser(t, { username: 'cyd' })
    for (const id of [ada, bob, cyd]) {
      await t.run((ctx) => ctx.db.patch(id, { emailVerified: true }))
    }
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)
    expect(await sends(t, campaignId)).toHaveLength(3)

    await t
      .withIdentity({ subject: fixtureClerkId('ada') })
      .mutation(api.users.deactivateAccount, {})
    await t
      .withIdentity({ subject: fixtureClerkId('bob') })
      .mutation(api.users.deleteAccount, {})
    await t.mutation(internal.users.upsertFromClerkWebhook, {
      clerkId: fixtureClerkId('cyd'),
      email: 'cyd@new.example.test',
      githubId: null,
      githubUsername: 'cyd',
      githubUrl: 'https://github.com/cyd',
      displayName: 'cyd',
      avatarUrl: '',
      emailVerified: true,
    })
    await drain(t)

    const rows = await sends(t, campaignId)
    expect(rows.map((row) => row.status)).toEqual([
      'cancelled',
      'cancelled',
      'cancelled',
    ])
  })

  it('deletes a purged member’s send records and consent log', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    const [member] = await seedMembers(t, 1)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)
    await t.run((ctx) =>
      setEmailPreference(ctx, {
        userId: member!,
        category: 'weekly_digest',
        subscribed: true,
        source: 'settings',
      }),
    )

    await t.mutation(internal.emailSends.purgeUserEmailRecords, {
      userId: member!,
    })
    await drain(t)

    expect(await sends(t, campaignId)).toEqual([])
    expect(
      await t.run((ctx) => ctx.db.query('email_preference_changes').collect()),
    ).toEqual([])
  })
})

function emailEvent(
  type:
    | 'email.sent'
    | 'email.delivered'
    | 'email.delivery_delayed'
    | 'email.bounced'
    | 'email.complained'
    | 'email.failed'
    | 'email.opened'
    | 'email.clicked',
) {
  const data = {
    created_at: '2026-09-01T12:00:00Z',
    email_id: 'resend_123',
    from: 'Locatic <updates@locatic.test>',
    to: 'member0@example.test',
    subject: 'Maps are live',
  }
  const extra =
    type === 'email.bounced'
      ? {
          bounce: {
            message: 'Mailbox does not exist',
            subType: 'general',
            type: 'Permanent',
          },
        }
      : type === 'email.failed'
        ? { failed: { reason: 'Rejected' } }
        : type === 'email.opened'
          ? { open: { ipAddress: '1', timestamp: 'x', userAgent: 'x' } }
          : type === 'email.clicked'
            ? {
                click: {
                  ipAddress: '1',
                  link: 'https://x',
                  timestamp: 'x',
                  userAgent: 'x',
                },
              }
            : {}
  return {
    type,
    created_at: '2026-09-01T12:00:00Z',
    data: { ...data, ...extra },
  } as never
}

describe('handleEmailEvent', () => {
  async function sentTo(t: T) {
    const adminId = await seedAdmin(t)
    const [member] = await seedMembers(t, 1)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)
    const [row] = await sends(t, campaignId)
    return { member: member!, row: row!, campaignId }
  }

  async function deliver(
    t: T,
    emailId: string,
    type: Parameters<typeof emailEvent>[0],
  ) {
    await t.mutation(internal.emailSends.handleEmailEvent, {
      id: emailId as EmailId,
      event: emailEvent(type),
    })
  }

  it('moves status forward only', async () => {
    const t = setup()
    const { row, campaignId } = await sentTo(t)

    await deliver(t, row.emailId, 'email.delivered')
    await deliver(t, row.emailId, 'email.sent')
    expect((await sends(t, campaignId))[0]?.status).toBe('delivered')

    for (const type of [
      'email.opened',
      'email.clicked',
      'email.delivery_delayed',
    ] as const) {
      await deliver(t, row.emailId, type)
    }
    expect((await sends(t, campaignId))[0]?.status).toBe('delivered')

    await deliver(t, row.emailId, 'email.bounced')
    const [bounced] = await sends(t, campaignId)
    expect(bounced?.status).toBe('bounced')
    expect(bounced?.errorMessage).toBe('Mailbox does not exist')
  })

  it('turns every preference off once on a complaint', async () => {
    const t = setup()
    const { member, row, campaignId } = await sentTo(t)
    await t.run((ctx) =>
      setEmailPreference(ctx, {
        userId: member,
        category: 'weekly_digest',
        subscribed: true,
        source: 'settings',
      }),
    )

    await deliver(t, row.emailId, 'email.complained')
    await deliver(t, row.emailId, 'email.complained')
    await deliver(t, row.emailId, 'email.delivered')
    await drain(t)

    expect((await sends(t, campaignId))[0]?.status).toBe('complained')
    const user = await t.run((ctx) => ctx.db.get(member))
    expect(user?.notificationPrefs.productUpdates).toBe(false)
    expect(user?.notificationPrefs.weeklyDigest).toBe(false)
    const complaints = (
      await t.run((ctx) => ctx.db.query('email_preference_changes').collect())
    ).filter((change) => change.source === 'complaint')
    expect(complaints.map((change) => change.category).sort()).toEqual([
      'product_updates',
      'weekly_digest',
    ])
  })

  it.each(['email.bounced', 'email.failed'] as const)(
    'still turns preferences off for a complaint after %s',
    async (first) => {
      const t = setup()
      const { member, row, campaignId } = await sentTo(t)

      await deliver(t, row.emailId, first)
      await deliver(t, row.emailId, 'email.complained')
      await drain(t)

      const [after] = await sends(t, campaignId)
      // The display status stays at the first terminal outcome.
      expect(after?.status).toBe(
        first === 'email.bounced' ? 'bounced' : 'failed',
      )
      expect(after?.complaintHandledAt).toEqual(expect.any(Number))
      const user = await t.run((ctx) => ctx.db.get(member))
      expect(user?.notificationPrefs.productUpdates).toBe(false)
    },
  )

  it('ignores a repeated complaint after the member turned email back on', async () => {
    const t = setup()
    const { member, row } = await sentTo(t)

    await deliver(t, row.emailId, 'email.complained')
    await drain(t)
    await t.run((ctx) =>
      setEmailPreference(ctx, {
        userId: member,
        category: 'product_updates',
        subscribed: true,
        source: 'settings',
      }),
    )
    await deliver(t, row.emailId, 'email.complained')
    await drain(t)

    const user = await t.run((ctx) => ctx.db.get(member))
    expect(user?.notificationPrefs.productUpdates).toBe(true)
    const complaints = (
      await t.run((ctx) => ctx.db.query('email_preference_changes').collect())
    ).filter((change) => change.source === 'complaint')
    expect(complaints).toHaveLength(1)
  })

  it('ignores emails without a send row, such as test sends', async () => {
    const t = setup()
    await expect(
      t.mutation(internal.emailSends.handleEmailEvent, {
        id: 'unknown_email' as EmailId,
        event: emailEvent('email.complained'),
      }),
    ).resolves.toBeNull()
  })
})

describe('reconcileSends', () => {
  const DAY = 24 * 60 * MINUTE

  it('leaves a sent row as sent when the component no longer has its copy', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 1)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)
    const [row] = await sends(t, campaignId)
    // Handed to Resend, which suppressed it: no delivery event ever comes.
    await t.run((ctx) => ctx.db.patch(row!._id, { status: 'sent' }))

    vi.setSystemTime(NOW + 20 * MINUTE)
    await t.run((ctx) =>
      ctx.runMutation(components.resend.lib.cleanupAbandonedEmails, {
        olderThan: MINUTE,
      }),
    )
    await t.mutation(internal.emailSends.reconcileSends, {})

    const [after] = await sends(t, campaignId)
    expect(after?.status).toBe('sent')
    expect(after?.errorMessage).toBeUndefined()
  })

  it('no longer touches rows older than the reconciliation window', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 2)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)
    const [first, second] = await sends(t, campaignId)
    await t.run((ctx) => ctx.db.patch(second!._id, { status: 'sent' }))
    await setComponentStatus(t, first!.emailId, 'delivered')
    await setComponentStatus(t, second!.emailId, 'delivered')

    vi.setSystemTime(NOW + 26 * DAY)
    await t.mutation(internal.emailSends.reconcileSends, {})

    const after = await sends(t, campaignId)
    expect(after.map((row) => [row.status, row.updatedAt])).toEqual([
      ['queued', NOW],
      ['sent', NOW],
    ])
  })

  it('copies outcomes the component reports without a callback', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 4)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)
    const rows = await sends(t, campaignId)
    await setComponentStatus(
      t,
      rows[0]!.emailId,
      'failed',
      'Resend API error: 422',
    )
    await setComponentStatus(t, rows[1]!.emailId, 'delivered')
    await setComponentStatus(t, rows[2]!.emailId, 'sent')
    // rows[3] stays waiting in the component.

    vi.setSystemTime(NOW + 5 * MINUTE)
    await t.mutation(internal.emailSends.reconcileSends, {})
    expect((await sends(t, campaignId)).map((row) => row.status)).toEqual([
      'queued',
      'queued',
      'queued',
      'queued',
    ])

    vi.setSystemTime(NOW + 20 * MINUTE)
    await t.mutation(internal.emailSends.reconcileSends, {})
    const after = await sends(t, campaignId)
    expect(after.map((row) => row.status)).toEqual([
      'failed',
      'delivered',
      'sent',
      'queued',
    ])
    expect(after[0]?.errorMessage).toBe('Resend API error: 422')
    // Rows it looked at move to the back of the line.
    expect(after[3]?.updatedAt).toBe(NOW + 20 * MINUTE)
  })

  it('marks a send failed when the component record is gone', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 1)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)

    vi.setSystemTime(NOW + 20 * MINUTE)
    // The component's retention cleanup removed its copy.
    await t.run((ctx) =>
      ctx.runMutation(components.resend.lib.cleanupAbandonedEmails, {
        olderThan: MINUTE,
      }),
    )
    await t.mutation(internal.emailSends.reconcileSends, {})

    expect((await sends(t, campaignId))[0]).toMatchObject({
      status: 'failed',
      errorMessage: 'No delivery record',
    })
  })

  it('keeps reconciling sent rows while many old queued rows remain', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 150)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)
    const [handedOver] = await sends(t, campaignId)
    await t.run((ctx) => ctx.db.patch(handedOver!._id, { status: 'sent' }))
    await setComponentStatus(t, handedOver!.emailId, 'delivered')

    // The 149 queued rows stay waiting in the component on every run.
    for (const minutes of [20, 40]) {
      vi.setSystemTime(NOW + minutes * MINUTE)
      await t.mutation(internal.emailSends.reconcileSends, {})
    }

    const after = await sends(t, campaignId)
    expect(after.find((row) => row._id === handedOver!._id)?.status).toBe(
      'delivered',
    )
  })

  it('looks at no more than 100 rows a run', async () => {
    const t = setup()
    const adminId = await seedAdmin(t)
    await seedMembers(t, 101)
    const campaignId = await seedCampaign(t, adminId)
    await startDirect(t, campaignId)
    await drain(t)

    vi.setSystemTime(NOW + 20 * MINUTE)
    await t.mutation(internal.emailSends.reconcileSends, {})

    const touched = (await sends(t, campaignId)).filter(
      (row) => row.updatedAt === NOW + 20 * MINUTE,
    )
    expect(touched).toHaveLength(100)
  })
})
