/**
 * Shared setup for the email send contract tests (convex/emailSends.*.test.ts).
 *
 * Like fixtures.helpers.ts, the Convex bundler picks this file up, so it has
 * no runtime import of `convex-test`, `vitest` or `import.meta.glob`: test
 * files create the test backend and pass in their timer controls.
 */
import type { EmailId } from '@convex-dev/resend'
import type { TestConvex } from 'convex-test'

import { components, internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { getResend } from '../lib/resend'
import { createDefaultViewerProfile } from '../lib/viewer'
import type schema from '../schema'
import { fixtureClerkId, NOW, seedUser } from './fixtures.helpers'

export const MINUTE = 60_000

export type T = TestConvex<typeof schema>

/** Environment every send test starts with; tests override single keys. */
export const EMAIL_SEND_TEST_ENV: Record<string, string> = {
  EMAIL_ADMIN_CLERK_IDS: fixtureClerkId('admin'),
  EMAIL_SENDING_ENABLED: 'true',
  EMAIL_TEST_SENDING_ENABLED: '',
  EMAIL_FROM: 'Locatic <updates@locatic.test>',
  EMAIL_REPLY_TO: 'hello@locatic.test',
  SITE_URL: 'https://locatic.test',
  CONVEX_SITE_URL: 'https://deployment.convex.site',
  EMAIL_UNSUBSCRIBE_SECRET: 'secret',
  RESEND_API_KEY: 're_test_key',
}

/**
 * Runs our zero-delay scheduled chain (batches, cancellations) without
 * firing the component's own delayed batch worker, which needs nested
 * workpool components that the test registration does not include.
 */
export async function drain(
  t: T,
  timers: { advanceTimersByTime: (ms: number) => unknown },
) {
  await t.finishAllScheduledFunctions(() => timers.advanceTimersByTime(0))
}

export async function seedAdmin(t: T) {
  return await seedUser(t, { username: 'admin' })
}

export async function seedMembers(t: T, count: number, prefix = 'member') {
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

export async function seedCampaign(t: T, adminId: Id<'users'>) {
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

export function asAdmin(t: T) {
  return t.withIdentity({ subject: fixtureClerkId('admin') })
}

export async function sends(t: T, campaignId: Id<'email_campaigns'>) {
  return await t.run((ctx) =>
    ctx.db
      .query('email_sends')
      .withIndex('by_campaign_and_user', (q) => q.eq('campaignId', campaignId))
      .collect(),
  )
}

export async function campaign(t: T, campaignId: Id<'email_campaigns'>) {
  return await t.run((ctx) => ctx.db.get(campaignId))
}

/** startSend with a fixed artifact; the action renders, these tests test the transaction. */
export async function startDirect(
  t: T,
  campaignId: Id<'email_campaigns'>,
  revision = 3,
) {
  await asAdmin(t).mutation(internal.emailCampaigns.startSend, {
    campaignId,
    expectedRevision: revision,
    html: '<p>Hello</p><a href="{{UNSUBSCRIBE_URL}}">Unsubscribe</a>',
    text: 'Hello\nUnsubscribe: {{UNSUBSCRIBE_URL}}',
  })
}

/** Cancels every pending scheduled function, as if the chain had died. */
export async function stopChain(t: T) {
  await t.run(async (ctx) => {
    for (const job of await ctx.db.system
      .query('_scheduled_functions')
      .collect()) {
      if (job.state.kind === 'pending') await ctx.scheduler.cancel(job._id)
    }
  })
}

export async function componentEmail(t: T, emailId: string) {
  return await t.run((ctx) => getResend().get(ctx, emailId as EmailId))
}

export async function setComponentStatus(
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

export type EmailEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.bounced'
  | 'email.complained'
  | 'email.failed'
  | 'email.opened'
  | 'email.clicked'

/** A Resend webhook event as the component passes it to onEmailEvent. */
export function emailEvent(type: EmailEventType) {
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
