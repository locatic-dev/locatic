import { v } from 'convex/values'

import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import { getViewerOrThrow } from './lib/auth'
import {
  applyProviderContactState,
  enqueueProviderContactCleanup,
  getContactStateVersion,
  upsertLocalEmailContact,
} from './lib/email_contacts'
import { requireEmailAdmin } from './lib/email_admin'
import { emailRefs } from './lib/email_function_refs'
import { optionalStringValidator } from './lib/validators'

const contactStatusValidator = v.object({
  subscribed: v.boolean(),
  emailVerified: v.boolean(),
  syncStatus: v.union(
    v.literal('not_started'),
    v.literal('pending'),
    v.literal('syncing'),
    v.literal('synced'),
    v.literal('failed'),
  ),
  suppression: v.union(
    v.literal('none'),
    v.literal('provider_unsubscribed'),
    v.literal('hard_bounce'),
    v.literal('complaint'),
    v.literal('provider_suppressed'),
  ),
  lastError: optionalStringValidator,
})

export const myStatus = query({
  args: {},
  returns: contactStatusValidator,
  handler: async (ctx) => {
    const viewer = await getViewerOrThrow(ctx)
    const contact = await ctx.db
      .query('email_contacts')
      .withIndex('by_user', (index) => index.eq('userId', viewer._id))
      .unique()

    return {
      subscribed: viewer.notificationPrefs.weeklyDigest,
      emailVerified:
        contact?.emailVerified ??
        viewer.emailSubscription?.primaryEmailVerified ??
        false,
      syncStatus: contact?.syncStatus ?? ('not_started' as const),
      suppression: contact?.suppression ?? ('none' as const),
      lastError: contact?.lastError ?? null,
    }
  },
})

export const ensureForUser = internalMutation({
  args: { userId: v.id('users') },
  returns: v.union(v.id('email_contacts'), v.null()),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId)
    return user ? await upsertLocalEmailContact(ctx, user) : null
  },
})

export const listPending = internalQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      contactId: v.id('email_contacts'),
      userId: v.id('users'),
      email: v.string(),
      normalizedEmail: v.string(),
      desiredSubscribed: v.boolean(),
      preferenceVersion: v.number(),
      stateVersion: v.number(),
      providerContactId: optionalStringValidator,
      syncedEmail: optionalStringValidator,
      providerUnsubscribed: v.boolean(),
      suppression: v.union(
        v.literal('none'),
        v.literal('provider_unsubscribed'),
        v.literal('hard_bounce'),
        v.literal('complaint'),
        v.literal('provider_suppressed'),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const requestedLimit = Math.min(Math.max(args.limit ?? 50, 1), 100)
    const pending = await ctx.db
      .query('email_contacts')
      .withIndex('by_sync_status_updated', (index) =>
        index.eq('syncStatus', 'pending'),
      )
      .take(requestedLimit)
    const failed =
      pending.length < requestedLimit
        ? await ctx.db
            .query('email_contacts')
            .withIndex('by_sync_status_updated', (index) =>
              index.eq('syncStatus', 'failed'),
            )
            .take(requestedLimit - pending.length)
        : []
    const syncing =
      pending.length + failed.length < requestedLimit
        ? await ctx.db
            .query('email_contacts')
            .withIndex('by_sync_status_updated', (index) =>
              index.eq('syncStatus', 'syncing'),
            )
            .take(requestedLimit - pending.length - failed.length)
        : []
    const rows = [...pending, ...failed, ...syncing]

    return rows.map((contact) => ({
      contactId: contact._id,
      userId: contact.userId,
      email: contact.email,
      normalizedEmail: contact.normalizedEmail,
      desiredSubscribed: contact.desiredSubscribed,
      preferenceVersion: contact.preferenceVersion,
      stateVersion: getContactStateVersion(contact),
      providerContactId: contact.providerContactId,
      syncedEmail: contact.syncedEmail,
      providerUnsubscribed: contact.providerUnsubscribed,
      suppression: contact.suppression,
    }))
  },
})

export const claimPending = internalMutation({
  args: { limit: v.optional(v.number()), now: v.optional(v.number()) },
  returns: v.array(
    v.object({
      contactId: v.id('email_contacts'),
      userId: v.id('users'),
      email: v.string(),
      normalizedEmail: v.string(),
      desiredSubscribed: v.boolean(),
      preferenceVersion: v.number(),
      stateVersion: v.number(),
      claimToken: v.string(),
      providerContactId: optionalStringValidator,
      syncedEmail: optionalStringValidator,
      providerUnsubscribed: v.boolean(),
      allowProviderResubscribe: v.boolean(),
      suppression: v.union(
        v.literal('none'),
        v.literal('provider_unsubscribed'),
        v.literal('hard_bounce'),
        v.literal('complaint'),
        v.literal('provider_suppressed'),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const limit = Math.min(Math.max(args.limit ?? 2, 1), 2)
    const pending = await ctx.db
      .query('email_contacts')
      .withIndex('by_sync_status_updated', (index) =>
        index.eq('syncStatus', 'pending'),
      )
      .take(limit)
    const dueFailed = await ctx.db
      .query('email_contacts')
      .withIndex('by_sync_status_retry', (index) =>
        index
          .eq('syncStatus', 'failed')
          .gt('nextRetryAt', null)
          .lte('nextRetryAt', now),
      )
      .take(limit)
    const expiredClaims = await ctx.db
      .query('email_contacts')
      .withIndex('by_sync_status_claim', (index) =>
        index.eq('syncStatus', 'syncing').lte('claimExpiresAt', now),
      )
      .take(limit)
    const candidates = [...pending, ...dueFailed, ...expiredClaims]
    const claimed = []
    for (const contact of candidates) {
      if (claimed.length >= limit) break
      const stateVersion = getContactStateVersion(contact)
      const claimToken = `${contact._id}:${stateVersion}:${now}`
      await ctx.db.patch(contact._id, {
        syncStatus: 'syncing',
        claimToken,
        claimExpiresAt: now + 60_000,
        lastSyncAttemptedAt: now,
        updatedAt: now,
      })
      claimed.push({
        contactId: contact._id,
        userId: contact.userId,
        email: contact.email,
        normalizedEmail: contact.normalizedEmail,
        desiredSubscribed: contact.desiredSubscribed,
        preferenceVersion: contact.preferenceVersion,
        stateVersion,
        claimToken,
        providerContactId: contact.providerContactId,
        syncedEmail: contact.syncedEmail,
        providerUnsubscribed: contact.providerUnsubscribed,
        allowProviderResubscribe: contact.allowProviderResubscribe ?? false,
        suppression: contact.suppression,
      })
    }
    return claimed
  },
})

export const markSyncAttempt = internalMutation({
  args: {
    contactId: v.id('email_contacts'),
    expectedPreferenceVersion: v.number(),
    claimToken: v.optional(v.string()),
    providerContactId: optionalStringValidator,
    syncedEmail: optionalStringValidator,
    status: v.union(v.literal('synced'), v.literal('failed')),
    retryable: v.optional(v.boolean()),
    error: optionalStringValidator,
  },
  returns: v.object({ applied: v.boolean(), cleanupQueued: v.boolean() }),
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId)
    if (!contact) {
      const cleanupQueued = Boolean(args.providerContactId)
      if (args.providerContactId) {
        await enqueueProviderContactCleanup(ctx, args.providerContactId)
        await ctx.scheduler.runAfter(
          0,
          emailRefs.delivery.reconcileContactCleanups,
          {},
        )
      }
      return { applied: false, cleanupQueued }
    }
    if (
      getContactStateVersion(contact) !== args.expectedPreferenceVersion ||
      (args.claimToken !== undefined && contact.claimToken !== args.claimToken)
    ) {
      const cleanupQueued = Boolean(
        args.providerContactId &&
        args.providerContactId !== contact.providerContactId,
      )
      if (
        args.providerContactId &&
        args.providerContactId !== contact.providerContactId
      ) {
        await enqueueProviderContactCleanup(ctx, args.providerContactId)
        await ctx.scheduler.runAfter(
          0,
          emailRefs.delivery.reconcileContactCleanups,
          {},
        )
      }
      if (
        contact &&
        args.claimToken &&
        contact.claimToken === args.claimToken
      ) {
        await ctx.db.patch(contact._id, {
          claimToken: null,
          claimExpiresAt: null,
          syncStatus: 'pending',
          updatedAt: Date.now(),
        })
      }
      return { applied: false, cleanupQueued }
    }

    const now = Date.now()
    const retryCount = (contact.retryCount ?? 0) + 1
    const retryable =
      args.status === 'failed' &&
      (args.retryable ??
        /429|rate_limit|timeout|temporar|\b5\d\d\b/i.test(args.error ?? '')) &&
      retryCount <= 6
    await ctx.db.patch(contact._id, {
      providerContactId: args.providerContactId,
      syncedEmail: args.syncedEmail,
      acknowledgedVersion:
        args.status === 'synced'
          ? contact.preferenceVersion
          : contact.acknowledgedVersion,
      acknowledgedStateVersion:
        args.status === 'synced'
          ? args.expectedPreferenceVersion
          : contact.acknowledgedStateVersion,
      syncStatus: args.status,
      claimToken: null,
      claimExpiresAt: null,
      retryCount: args.status === 'synced' ? 0 : retryCount,
      nextRetryAt:
        args.status === 'synced'
          ? null
          : retryable
            ? now + Math.min(60 * 60_000, 2 ** (retryCount - 1) * 5_000)
            : null,
      allowProviderResubscribe:
        args.status === 'synced'
          ? false
          : (contact.allowProviderResubscribe ?? false),
      lastError: args.error,
      lastSyncAttemptedAt: now,
      lastSyncedAt: args.status === 'synced' ? now : contact.lastSyncedAt,
      updatedAt: now,
    })
    return { applied: true, cleanupQueued: false }
  },
})

export const retryFailed = mutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ retried: v.number() }),
  handler: async (ctx, args) => {
    await requireEmailAdmin(ctx)
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 50)
    const contacts = await ctx.db
      .query('email_contacts')
      .withIndex('by_sync_status_retry', (index) =>
        index.eq('syncStatus', 'failed').eq('nextRetryAt', null),
      )
      .take(limit)
    const now = Date.now()
    for (const contact of contacts) {
      await ctx.db.patch(contact._id, {
        syncStatus: 'pending',
        claimToken: null,
        claimExpiresAt: null,
        retryCount: 0,
        updatedAt: now,
      })
    }
    if (contacts.length > 0) {
      await ctx.scheduler.runAfter(0, emailRefs.delivery.reconcileContacts, {})
    }
    return { retried: contacts.length }
  },
})

export const claimCleanups = internalMutation({
  args: { limit: v.optional(v.number()), now: v.optional(v.number()) },
  returns: v.array(
    v.object({
      cleanupId: v.id('email_contact_cleanups'),
      providerContactId: v.string(),
      claimToken: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const limit = Math.min(Math.max(args.limit ?? 2, 1), 10)
    const pending = await ctx.db
      .query('email_contact_cleanups')
      .withIndex('by_status_retry', (index) =>
        index.eq('status', 'pending').eq('nextRetryAt', null),
      )
      .take(limit)
    const failed = await ctx.db
      .query('email_contact_cleanups')
      .withIndex('by_status_retry', (index) =>
        index
          .eq('status', 'failed')
          .gt('nextRetryAt', null)
          .lte('nextRetryAt', now),
      )
      .take(limit)
    const expired = await ctx.db
      .query('email_contact_cleanups')
      .withIndex('by_status_claim', (index) =>
        index.eq('status', 'processing').lte('claimExpiresAt', now),
      )
      .take(limit)
    const claimed = []
    for (const cleanup of [...pending, ...failed, ...expired]) {
      if (claimed.length >= limit) break
      const claimToken = `${cleanup._id}:${now}`
      await ctx.db.patch(cleanup._id, {
        status: 'processing',
        claimToken,
        claimExpiresAt: now + 60_000,
        updatedAt: now,
      })
      claimed.push({
        cleanupId: cleanup._id,
        providerContactId: cleanup.providerContactId,
        claimToken,
      })
    }
    return claimed
  },
})

export const markCleanupAttempt = internalMutation({
  args: {
    cleanupId: v.id('email_contact_cleanups'),
    claimToken: v.string(),
    deleted: v.boolean(),
    retryable: v.optional(v.boolean()),
    error: optionalStringValidator,
  },
  returns: v.object({ applied: v.boolean() }),
  handler: async (ctx, args) => {
    const cleanup = await ctx.db.get(args.cleanupId)
    if (!cleanup || cleanup.claimToken !== args.claimToken) {
      return { applied: false }
    }
    if (args.deleted) {
      await ctx.db.delete(cleanup._id)
      return { applied: true }
    }
    const now = Date.now()
    const retryCount = cleanup.retryCount + 1
    const retryDelay = Math.min(
      24 * 60 * 60_000,
      2 ** Math.min(retryCount - 1, 12) * 5_000,
    )
    await ctx.db.patch(cleanup._id, {
      status: 'failed',
      claimToken: null,
      claimExpiresAt: null,
      retryCount,
      nextRetryAt: now + retryDelay,
      lastError: args.error,
      updatedAt: now,
    })
    return { applied: true }
  },
})

export const applyProviderState = internalMutation({
  args: {
    eventId: v.string(),
    email: v.string(),
    providerContactId: optionalStringValidator,
    providerUnsubscribed: v.optional(v.boolean()),
    suppression: v.optional(
      v.union(
        v.literal('hard_bounce'),
        v.literal('complaint'),
        v.literal('provider_suppressed'),
      ),
    ),
  },
  returns: v.object({
    status: v.union(v.literal('applied'), v.literal('ignored')),
  }),
  handler: async (ctx, args) => {
    return await applyProviderContactState(ctx, args)
  },
})
