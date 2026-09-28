import type { MutationCtx, QueryCtx } from '../_generated/server'
import { ConvexError } from 'convex/values'
import type { Doc } from './types'

type DbCtx = Pick<MutationCtx | QueryCtx, 'db'>

export const EMAIL_AUDIENCE_LIMIT = 500

// This is a restricted, cleanup-only identifier. It is retained without an
// email address or user reference only until the provider confirms deletion.
export async function enqueueProviderContactCleanup(
  ctx: Pick<MutationCtx, 'db'>,
  providerContactId: string,
) {
  const existing = await ctx.db
    .query('email_contact_cleanups')
    .withIndex('by_provider_contact', (index) =>
      index.eq('providerContactId', providerContactId),
    )
    .first()
  if (existing) return existing._id

  const now = Date.now()
  return await ctx.db.insert('email_contact_cleanups', {
    providerContactId,
    status: 'pending',
    claimToken: null,
    claimExpiresAt: null,
    retryCount: 0,
    nextRetryAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  })
}

export function normalizeEmailAddress(email: string) {
  return email.trim().toLowerCase()
}

export function isUsableEmailAddress(email: string) {
  const normalized = normalizeEmailAddress(email)
  return (
    normalized.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) &&
    !normalized.endsWith('.invalid')
  )
}

export function getEmailPreferenceVersion(user: Doc<'users'>) {
  return user.emailSubscription?.preferenceVersion ?? 0
}

export function isTrustedPrimaryEmailVerified(user: Doc<'users'>) {
  return user.emailSubscription?.primaryEmailVerified === true
}

function wantsCommunityEmail(
  user: Doc<'users'>,
  contact?: Pick<Doc<'email_contacts'>, 'providerUnsubscribed' | 'suppression'>,
) {
  return (
    user.notificationPrefs.weeklyDigest &&
    user.deletedAt === null &&
    user.deactivatedAt === null &&
    isTrustedPrimaryEmailVerified(user) &&
    isUsableEmailAddress(user.email) &&
    !contact?.providerUnsubscribed &&
    (!contact || contact.suppression === 'none')
  )
}

export function getContactStateVersion(
  contact: Pick<Doc<'email_contacts'>, 'preferenceVersion' | 'stateVersion'>,
) {
  return contact.stateVersion ?? contact.preferenceVersion
}

export function getAcknowledgedContactStateVersion(
  contact: Pick<
    Doc<'email_contacts'>,
    'acknowledgedVersion' | 'acknowledgedStateVersion'
  >,
) {
  return contact.acknowledgedStateVersion ?? contact.acknowledgedVersion
}

function providerStateChanged(
  contact: Doc<'email_contacts'>,
  next: {
    normalizedEmail: string
    emailVerified: boolean
    desiredSubscribed: boolean
    providerUnsubscribed: boolean
    suppression: Doc<'email_contacts'>['suppression']
    allowProviderResubscribe: boolean
  },
) {
  return (
    contact.normalizedEmail !== next.normalizedEmail ||
    contact.emailVerified !== next.emailVerified ||
    contact.desiredSubscribed !== next.desiredSubscribed ||
    contact.providerUnsubscribed !== next.providerUnsubscribed ||
    contact.suppression !== next.suppression ||
    (contact.allowProviderResubscribe ?? false) !==
      next.allowProviderResubscribe
  )
}

async function refreshDuplicateEmailGroup(
  ctx: Pick<MutationCtx, 'db'>,
  normalizedEmail: string,
  now: number,
) {
  const contacts = await ctx.db
    .query('email_contacts')
    .withIndex('by_normalized_email', (index) =>
      index.eq('normalizedEmail', normalizedEmail),
    )
    .take(5_001)
  if (contacts.length > 5_000) {
    throw new ConvexError('Too many accounts share this email address')
  }
  const duplicated = contacts.length > 1
  for (const contact of contacts) {
    const contactUser = await ctx.db.get(contact.userId)
    const desiredSubscribed = Boolean(
      contactUser && !duplicated && wantsCommunityEmail(contactUser, contact),
    )
    if (contact.desiredSubscribed !== desiredSubscribed) {
      await ctx.db.patch(contact._id, {
        desiredSubscribed,
        stateVersion: getContactStateVersion(contact) + 1,
        syncStatus: 'pending',
        claimToken: null,
        claimExpiresAt: null,
        nextRetryAt: null,
        lastError: null,
        updatedAt: now,
      })
    }
  }
}

export async function upsertLocalEmailContact(
  ctx: Pick<MutationCtx, 'db'>,
  user: Doc<'users'>,
) {
  const now = Date.now()
  const normalizedEmail = normalizeEmailAddress(user.email)
  const preferenceVersion = getEmailPreferenceVersion(user)
  const existing = await ctx.db
    .query('email_contacts')
    .withIndex('by_user', (query) => query.eq('userId', user._id))
    .unique()
  const explicitResubscribe = Boolean(
    existing?.providerUnsubscribed &&
    existing.suppression === 'provider_unsubscribed' &&
    user.notificationPrefs.weeklyDigest &&
    user.emailSubscription?.preferenceSource === 'settings' &&
    preferenceVersion > (existing.providerOptOutPreferenceVersion ?? -1),
  )
  const providerUnsubscribed = explicitResubscribe
    ? false
    : (existing?.providerUnsubscribed ?? false)
  const suppression = explicitResubscribe
    ? 'none'
    : (existing?.suppression ?? 'none')
  const contactForEligibility = existing
    ? { ...existing, providerUnsubscribed, suppression }
    : undefined
  const desiredSubscribed = wantsCommunityEmail(user, contactForEligibility)
  const emailVerified = isTrustedPrimaryEmailVerified(user)

  if (!existing) {
    const contactId = await ctx.db.insert('email_contacts', {
      userId: user._id,
      email: user.email,
      normalizedEmail,
      emailVerified: isTrustedPrimaryEmailVerified(user),
      desiredSubscribed,
      preferenceVersion,
      acknowledgedVersion: 0,
      stateVersion: 1,
      acknowledgedStateVersion: 0,
      syncStatus: 'pending',
      claimToken: null,
      claimExpiresAt: null,
      retryCount: 0,
      nextRetryAt: null,
      providerContactId: null,
      syncedEmail: null,
      providerUnsubscribed: false,
      providerOptOutPreferenceVersion: null,
      allowProviderResubscribe: false,
      suppression: 'none',
      lastError: null,
      lastSyncAttemptedAt: null,
      lastSyncedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    await refreshDuplicateEmailGroup(ctx, normalizedEmail, now)
    return contactId
  }

  const previousNormalizedEmail = existing.normalizedEmail
  const nextProviderState = {
    normalizedEmail,
    emailVerified,
    desiredSubscribed,
    providerUnsubscribed,
    suppression,
    allowProviderResubscribe: explicitResubscribe,
  }
  const changed = providerStateChanged(existing, nextProviderState)
  await ctx.db.patch(existing._id, {
    email: user.email,
    normalizedEmail,
    emailVerified,
    desiredSubscribed,
    preferenceVersion,
    providerUnsubscribed,
    suppression,
    allowProviderResubscribe: explicitResubscribe,
    ...(changed
      ? {
          stateVersion: getContactStateVersion(existing) + 1,
          syncStatus: 'pending' as const,
          claimToken: null,
          claimExpiresAt: null,
          retryCount: 0,
          nextRetryAt: null,
          lastError: null,
        }
      : {}),
    updatedAt: now,
  })
  await refreshDuplicateEmailGroup(ctx, normalizedEmail, now)
  if (previousNormalizedEmail !== normalizedEmail) {
    await refreshDuplicateEmailGroup(ctx, previousNormalizedEmail, now)
  }
  return existing._id
}

export async function collectEmailAudience(ctx: DbCtx) {
  const contacts = await ctx.db
    .query('email_contacts')
    .take(EMAIL_AUDIENCE_LIMIT + 1)
  if (contacts.length > EMAIL_AUDIENCE_LIMIT) {
    throw new ConvexError(
      `Audience exceeds the ${EMAIL_AUDIENCE_LIMIT}-contact reviewed delivery limit. Add pagination before sending at this scale.`,
    )
  }
  const duplicateAddresses = new Set<string>()
  const addressCounts = new Map<string, number>()
  for (const contact of contacts) {
    addressCounts.set(
      contact.normalizedEmail,
      (addressCounts.get(contact.normalizedEmail) ?? 0) + 1,
    )
  }
  for (const [email, count] of addressCounts) {
    if (count > 1) duplicateAddresses.add(email)
  }

  const summary = {
    eligible: 0,
    excludedDisabled: 0,
    excludedInactive: 0,
    excludedUnverified: 0,
    excludedSuppressed: 0,
    excludedDuplicate: 0,
    pendingSync: 0,
  }
  const recipients: Array<{
    contactId: Doc<'email_contacts'>['_id']
    normalizedEmail: string
    stateVersion: number
    providerContactId: string
  }> = []

  for (const contact of contacts) {
    const user = await ctx.db.get(contact.userId)
    const pending =
      contact.syncStatus !== 'synced' ||
      getAcknowledgedContactStateVersion(contact) !==
        getContactStateVersion(contact)
    if (pending) summary.pendingSync += 1

    if (!user || user.deletedAt || user.deactivatedAt) {
      summary.excludedInactive += 1
      continue
    }
    if (!user.notificationPrefs.weeklyDigest) {
      summary.excludedDisabled += 1
      continue
    }
    if (!contact.emailVerified || !isUsableEmailAddress(contact.email)) {
      summary.excludedUnverified += 1
      continue
    }
    if (contact.providerUnsubscribed || contact.suppression !== 'none') {
      summary.excludedSuppressed += 1
      continue
    }
    if (duplicateAddresses.has(contact.normalizedEmail)) {
      summary.excludedDuplicate += 1
      continue
    }
    if (pending) continue
    summary.eligible += 1
    if (contact.providerContactId) {
      recipients.push({
        contactId: contact._id,
        normalizedEmail: contact.normalizedEmail,
        stateVersion: getContactStateVersion(contact),
        providerContactId: contact.providerContactId,
      })
    } else {
      summary.eligible -= 1
      summary.pendingSync += 1
    }
  }

  return { summary, recipients }
}

export async function summarizeEmailAudience(ctx: DbCtx) {
  return (await collectEmailAudience(ctx)).summary
}

export async function applyProviderContactState(
  ctx: Pick<MutationCtx, 'db'>,
  args: {
    email: string
    providerContactId?: string | null
    providerUnsubscribed?: boolean
    suppression?: 'hard_bounce' | 'complaint' | 'provider_suppressed'
  },
) {
  const normalizedEmail = normalizeEmailAddress(args.email)
  if (!isUsableEmailAddress(normalizedEmail)) {
    return { status: 'ignored' as const }
  }

  const contacts = await ctx.db
    .query('email_contacts')
    .withIndex('by_normalized_email', (index) =>
      index.eq('normalizedEmail', normalizedEmail),
    )
    .take(100)
  if (contacts.length === 0) {
    return { status: 'ignored' as const }
  }

  const now = Date.now()
  for (const contact of contacts) {
    const providerUnsubscribed =
      args.providerUnsubscribed ?? contact.providerUnsubscribed
    const suppression =
      args.suppression ??
      (providerUnsubscribed ? 'provider_unsubscribed' : contact.suppression)
    const nextDesiredSubscribed = providerUnsubscribed
      ? false
      : contact.desiredSubscribed
    const changed =
      contact.providerUnsubscribed !== providerUnsubscribed ||
      contact.suppression !== suppression ||
      contact.desiredSubscribed !== nextDesiredSubscribed
    await ctx.db.patch(contact._id, {
      providerContactId: args.providerContactId ?? contact.providerContactId,
      providerUnsubscribed,
      providerOptOutPreferenceVersion: providerUnsubscribed
        ? contact.preferenceVersion
        : contact.providerOptOutPreferenceVersion,
      allowProviderResubscribe: false,
      suppression,
      desiredSubscribed: nextDesiredSubscribed,
      ...(changed
        ? {
            stateVersion: getContactStateVersion(contact) + 1,
            syncStatus: 'pending' as const,
            claimToken: null,
            claimExpiresAt: null,
            retryCount: 0,
            nextRetryAt: null,
          }
        : {}),
      updatedAt: now,
    })

    if (providerUnsubscribed) {
      const user = await ctx.db.get(contact.userId)
      if (user?.notificationPrefs.weeklyDigest) {
        const nextVersion = (user.emailSubscription?.preferenceVersion ?? 0) + 1
        await ctx.db.patch(user._id, {
          notificationPrefs: {
            ...user.notificationPrefs,
            weeklyDigest: false,
          },
          emailSubscription: {
            primaryEmailVerified:
              user.emailSubscription?.primaryEmailVerified ?? false,
            primaryEmailVerifiedAt:
              user.emailSubscription?.primaryEmailVerifiedAt ?? null,
            preferenceVersion: nextVersion,
            preferenceUpdatedAt: now,
            preferenceSource: 'provider',
          },
          updatedAt: now,
        })
      }
    }
  }

  return { status: 'applied' as const }
}
