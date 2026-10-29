import { v } from 'convex/values'

import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import {
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server'
import {
  clerkRetryAfterSeconds,
  listClerkPrimaryEmails,
} from './lib/clerk_users'
import { normalizeEmailAddress } from './lib/email_address'
import { isAccountPastRestorationWindow } from './lib/account_deletion'

// One-off backfills for the community email fields. Run by hand on each
// deployment before the optional fields are made required (see
// docs/community-email.md).

const PAGE_SIZE = 100

const cursorValidator = v.union(v.string(), v.null())

// What the backfill saw before asking Clerk. If any of it changed by the time
// the answer is applied (the Clerk webhook wrote newer data), the member is
// skipped: the webhook owns anything newer than the lookup.
const snapshotValidator = v.object({
  email: v.string(),
  emailVerified: v.union(v.boolean(), v.null()),
  updatedAt: v.number(),
})

/**
 * Existing members are subscribed to Locatic updates, logged
 * with source `backfill`. Members who already have the key are untouched.
 */
export const backfillProductUpdates = internalMutation({
  args: { cursor: cursorValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query('users')
      .paginate({ numItems: PAGE_SIZE, cursor: args.cursor })
    const now = Date.now()
    for (const user of page.page) {
      if (user.notificationPrefs.productUpdates !== undefined) continue
      if (
        user.purgeProgress != null ||
        isAccountPastRestorationWindow(user, now)
      ) {
        // Irreversible deletion must not recreate consent after that table's
        // purge stage. Keep the future required preference explicitly off.
        await ctx.db.patch(user._id, {
          notificationPrefs: {
            ...user.notificationPrefs,
            productUpdates: false,
          },
        })
        continue
      }
      // Not setEmailPreference: it reads a missing key as subscribed already.
      await ctx.db.patch(user._id, {
        notificationPrefs: { ...user.notificationPrefs, productUpdates: true },
      })
      await ctx.db.insert('email_preference_changes', {
        userId: user._id,
        category: 'product_updates',
        subscribed: true,
        source: 'backfill',
        changedAt: now,
      })
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.emailMigrations.backfillProductUpdates,
        { cursor: page.continueCursor },
      )
    }
    return null
  },
})

/**
 * Removes PR #32's deprecated `users.emailSubscription` from every member, a
 * page at a time, so the field can leave the schema.
 */
export const clearLegacyEmailSubscription = internalMutation({
  args: { cursor: cursorValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query('users')
      .paginate({ numItems: PAGE_SIZE, cursor: args.cursor })
    for (const user of page.page) {
      if (user.emailSubscription !== undefined) {
        await ctx.db.patch(user._id, { emailSubscription: undefined })
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.emailMigrations.clearLegacyEmailSubscription,
        { cursor: page.continueCursor },
      )
    }
    return null
  },
})

export const listUsersForEmailBackfill = internalQuery({
  args: { cursor: cursorValidator },
  returns: v.object({
    users: v.array(
      v.object({
        userId: v.id('users'),
        clerkId: v.string(),
        snapshot: snapshotValidator,
      }),
    ),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query('users')
      .paginate({ numItems: PAGE_SIZE, cursor: args.cursor })
    return {
      users: page.page.map((user) => ({
        userId: user._id,
        clerkId: user.clerkId,
        snapshot: {
          email: user.email,
          emailVerified: user.emailVerified ?? null,
          updatedAt: user.updatedAt,
        },
      })),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    }
  },
})

const applyResultValidator = v.object({
  verified: v.number(),
  unverified: v.number(),
  // Written as false: Locatic cannot vouch for the stored address.
  addressMismatch: v.number(),
  noPrimaryAddress: v.number(),
  missingInClerk: v.number(),
  // Not written: the webhook changed the member after the lookup.
  changedSinceSnapshot: v.array(v.id('users')),
})

/**
 * Writes `emailVerified` for members unchanged since the lookup (`snapshot`);
 * a member changed since then is skipped and reported, since the webhook owns
 * newer data. Clerk's verification is written only when Clerk's primary
 * address is the stored one. Otherwise the member gets `false`: Clerk no
 * longer has them (including purged accounts), they have no primary address,
 * or the stored address is stale. That way every member ends with the field,
 * and none is emailed on an address nobody verified.
 */
export const applyEmailVerified = internalMutation({
  args: {
    updates: v.array(
      v.object({
        userId: v.id('users'),
        // null when Clerk has no such user.
        clerk: v.union(
          v.object({
            email: v.union(v.string(), v.null()),
            verified: v.boolean(),
          }),
          v.null(),
        ),
        snapshot: snapshotValidator,
      }),
    ),
  },
  returns: applyResultValidator,
  handler: async (ctx, args) => {
    const result = {
      verified: 0,
      unverified: 0,
      addressMismatch: 0,
      noPrimaryAddress: 0,
      missingInClerk: 0,
      changedSinceSnapshot: [] as Id<'users'>[],
    }
    for (const update of args.updates) {
      const user = await ctx.db.get(update.userId)
      if (
        !user ||
        user.email !== update.snapshot.email ||
        (user.emailVerified ?? null) !== update.snapshot.emailVerified ||
        user.updatedAt !== update.snapshot.updatedAt
      ) {
        result.changedSinceSnapshot.push(update.userId)
        continue
      }
      let emailVerified = false
      if (!update.clerk) {
        result.missingInClerk += 1
      } else if (update.clerk.email === null) {
        result.noPrimaryAddress += 1
      } else if (
        normalizeEmailAddress(update.clerk.email) !==
        normalizeEmailAddress(user.email)
      ) {
        result.addressMismatch += 1
      } else {
        emailVerified = update.clerk.verified
        result[emailVerified ? 'verified' : 'unverified'] += 1
      }
      await ctx.db.patch(user._id, { emailVerified })
    }
    return result
  },
})

/**
 * Pages Convex users, asks Clerk for those users by id (100 per call) and
 * applies their verification, so a run leaves every unchanged member with the
 * field set. Members changed during the lookup are left for a rerun. On a 429
 * it tries the same page again after Clerk's Retry-After.
 */
export const backfillEmailVerified = internalAction({
  args: { cursor: cursorValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.runQuery(
      internal.emailMigrations.listUsersForEmailBackfill,
      args,
    )
    let clerkUsers
    try {
      clerkUsers = await listClerkPrimaryEmails(
        page.users.map((user) => user.clerkId),
      )
    } catch (error) {
      const retryAfter = clerkRetryAfterSeconds(error)
      if (retryAfter === null) throw error
      await ctx.scheduler.runAfter(
        retryAfter * 1_000,
        internal.emailMigrations.backfillEmailVerified,
        args,
      )
      return null
    }
    const byClerkId = new Map(clerkUsers.map((user) => [user.clerkId, user]))
    if (page.users.length > 0) {
      const result = await ctx.runMutation(
        internal.emailMigrations.applyEmailVerified,
        {
          updates: page.users.map((user) => {
            const clerkUser = byClerkId.get(user.clerkId)
            return {
              userId: user.userId,
              clerk: clerkUser
                ? { email: clerkUser.email, verified: clerkUser.verified }
                : null,
              snapshot: user.snapshot,
            }
          }),
        },
      )
      console.log(
        `emailVerified backfill page: ${result.verified} verified, ${result.unverified} unverified, ${result.addressMismatch} address differs from Clerk, ${result.noPrimaryAddress} no primary address, ${result.missingInClerk} missing in Clerk, ${result.changedSinceSnapshot.length} changed since lookup (rerun for these)${
          result.changedSinceSnapshot.length > 0
            ? `: ${result.changedSinceSnapshot.join(', ')}`
            : ''
        }`,
      )
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.emailMigrations.backfillEmailVerified,
        { cursor: page.continueCursor },
      )
    }
    return null
  },
})
