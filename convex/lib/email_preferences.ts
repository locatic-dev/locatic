import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { isSubscribed, type EmailCategory } from './email_audience'
import type { Doc } from './types'
import { isAccountPastRestorationWindow } from './account_deletion'

export type EmailPreferenceSource = Doc<'email_preference_changes'>['source']

/**
 * The only code that changes email preferences. It patches one key, logs a
 * consent row only when the value changes, and on opt-out schedules
 * cancellation of waiting sends in its own transaction, so a cancellation
 * failure can never roll back the opt-out.
 */
export async function setEmailPreference(
  ctx: MutationCtx,
  args: {
    userId: Id<'users'>
    category: EmailCategory
    subscribed: boolean
    source: EmailPreferenceSource
  },
) {
  const user = await ctx.db.get(args.userId)
  // Old links still succeed, including between purge pages, without recreating
  // rows in a table already swept. Recoverable accounts can still opt out.
  if (
    !user ||
    user.purgeProgress != null ||
    isAccountPastRestorationWindow(user, Date.now())
  )
    return { changed: false }
  if (isSubscribed(user, args.category) === args.subscribed) {
    return { changed: false }
  }
  const now = Date.now()
  const key =
    args.category === 'weekly_digest' ? 'weeklyDigest' : 'productUpdates'
  // Spreads the prefs read in this transaction; Convex mutations are
  // serializable, so a concurrent writer cannot be overwritten.
  await ctx.db.patch(user._id, {
    notificationPrefs: { ...user.notificationPrefs, [key]: args.subscribed },
    updatedAt: now,
  })
  await ctx.db.insert('email_preference_changes', {
    userId: user._id,
    category: args.category,
    subscribed: args.subscribed,
    source: args.source,
    changedAt: now,
  })
  if (!args.subscribed) {
    // Only this category, and only sends that existed at this moment: a
    // later send follows a later eligibility check.
    await ctx.scheduler.runAfter(0, internal.emailSends.cancelWaitingSends, {
      userId: user._id,
      category: args.category,
      before: now,
    })
  }
  return { changed: true }
}
