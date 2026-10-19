import { v } from 'convex/values'

import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from './_generated/server'
import { getViewerOrThrow } from './lib/auth'
import { isSubscribed } from './lib/email_audience'
import { setEmailPreference } from './lib/email_preferences'
import { verifyUnsubscribeToken } from './lib/unsubscribe_token'
import { emailCategoryValidator } from './lib/validators'

export const updateEmailPreference = mutation({
  args: { category: emailCategoryValidator, subscribed: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    await setEmailPreference(ctx, {
      userId: viewer._id,
      category: args.category,
      subscribed: args.subscribed,
      source: 'settings',
    })
    return null
  },
})

// Complaints per member are rare; a few is enough to find a current one.
const COMPLAINT_SCAN = 20

export const myEmailStatus = query({
  args: {},
  returns: v.object({
    productUpdates: v.boolean(),
    weeklyDigest: v.boolean(),
    emailVerified: v.boolean(),
    blocked: v.union(v.literal('bounced'), v.literal('complained'), v.null()),
  }),
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    // Only sends to the current address count; an address change resets.
    const since = viewer.emailChangedAt ?? 0
    // A complaint is recorded on the send whatever its displayed status
    // (failed, cancelled, bounced…), so look for it directly. Complaints
    // handled after the change may still concern an earlier send.
    const complaints = await ctx.db
      .query('email_sends')
      .withIndex('by_user_and_complaint_handled_at', (q) =>
        q.eq('userId', viewer._id).gt('complaintHandledAt', since),
      )
      .order('desc')
      .take(COMPLAINT_SCAN)
    const bounce = await ctx.db
      .query('email_sends')
      .withIndex('by_user_and_status_and_created_at', (q) =>
        q
          .eq('userId', viewer._id)
          .eq('status', 'bounced')
          .gt('createdAt', since),
      )
      .first()
    const blocked = complaints.some((row) => row.createdAt > since)
      ? ('complained' as const)
      : bounce
        ? ('bounced' as const)
        : null
    return {
      productUpdates: isSubscribed(viewer, 'product_updates'),
      weeklyDigest: isSubscribed(viewer, 'weekly_digest'),
      emailVerified: viewer.emailVerified === true,
      blocked,
    }
  },
})

const tokenResultValidator = v.union(
  v.object({
    status: v.literal('unsubscribed'),
    category: emailCategoryValidator,
  }),
  v.object({ status: v.literal('invalid') }),
)

async function userFromToken(ctx: MutationCtx, token: string) {
  const parsed = await verifyUnsubscribeToken(token)
  if (!parsed) return null
  const userId = ctx.db.normalizeId('users', parsed.userId)
  return userId ? { userId, category: parsed.category } : null
}

// Public, unauthenticated: the signed token is the authorization. A valid
// token for a user who no longer exists succeeds without changes (the
// single writer ignores missing users).
export const unsubscribeWithToken = mutation({
  args: { token: v.string() },
  returns: tokenResultValidator,
  handler: async (ctx, args) => {
    const parsed = await userFromToken(ctx, args.token)
    if (!parsed) return { status: 'invalid' as const }
    await setEmailPreference(ctx, {
      ...parsed,
      subscribed: false,
      source: 'unsubscribe_link',
    })
    return { status: 'unsubscribed' as const, category: parsed.category }
  },
})

export const stopAllWithToken = mutation({
  args: { token: v.string() },
  returns: tokenResultValidator,
  handler: async (ctx, args) => {
    const parsed = await userFromToken(ctx, args.token)
    if (!parsed) return { status: 'invalid' as const }
    for (const category of ['product_updates', 'weekly_digest'] as const) {
      await setEmailPreference(ctx, {
        userId: parsed.userId,
        category,
        subscribed: false,
        source: 'unsubscribe_link',
      })
    }
    return { status: 'unsubscribed' as const, category: parsed.category }
  },
})

export const oneClickUnsubscribe = internalMutation({
  args: { token: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const parsed = await userFromToken(ctx, args.token)
    if (!parsed) return false
    await setEmailPreference(ctx, {
      ...parsed,
      subscribed: false,
      source: 'one_click',
    })
    return true
  },
})
