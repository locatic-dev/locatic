import { convexTest } from 'convex-test'
import { afterEach, expect, it, vi } from 'vitest'

import { fixtureClerkId, seedUser } from './__tests__/fixtures.helpers'
import { internal } from './_generated/api'
import { summarizeEmailAudience } from './lib/email_contacts'
import { emailRefs } from './lib/email_function_refs'
import schema from './schema'

const provider = vi.hoisted(() => ({
  contacts: {
    get: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    topics: { update: vi.fn(), list: vi.fn() },
    segments: { add: vi.fn(), remove: vi.fn() },
  },
}))

vi.mock('resend', () => ({
  Resend: class {
    contacts = provider.contacts
  },
}))

const modules = import.meta.glob('./**/*.ts')
const content = {
  subject: 'Shipping',
  preheader: 'News',
  introduction: 'Latest community news',
  projects: [],
  discussions: [],
  shippingUpdate: 'Update',
}

afterEach(() => vi.unstubAllEnvs())

async function setup() {
  const t = convexTest(schema, modules)
  vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
  await seedUser(t, { username: 'admin' })
  const userId = await seedUser(t, { username: 'reader' })
  await t.run(async (ctx) => {
    const user = await ctx.db.get(userId)
    if (!user) throw new Error('missing user')
    await ctx.db.patch(userId, {
      notificationPrefs: { ...user.notificationPrefs, weeklyDigest: true },
      emailSubscription: {
        ...user.emailSubscription!,
        primaryEmailVerified: true,
        preferenceVersion: 1,
      },
    })
  })
  await t.mutation(emailRefs.contacts.ensureForUser, { userId })
  const contact = await t.run((ctx) =>
    ctx.db
      .query('email_contacts')
      .withIndex('by_user', (query) => query.eq('userId', userId))
      .unique(),
  )
  if (!contact) throw new Error('missing contact')
  const admin = t.withIdentity({ subject: fixtureClerkId('admin') })
  const campaignId = await admin.mutation(emailRefs.campaigns.createDraft, {
    kind: 'announcement',
    title: 'Update',
  })
  await admin.mutation(emailRefs.campaigns.saveDraft, {
    campaignId,
    expectedRevision: 1,
    title: 'Update',
    content,
  })
  return { t, admin, userId, contact, campaignId }
}

it('blocks audience handoff while a known provider member awaits opt-out', async () => {
  const { t, userId, contact } = await setup()
  await t.run(async (ctx) => {
    const user = await ctx.db.get(userId)
    if (!user) throw new Error('missing user')
    await ctx.db.patch(userId, {
      notificationPrefs: { ...user.notificationPrefs, weeklyDigest: false },
    })
    await ctx.db.patch(contact._id, {
      providerContactId: 'provider_1',
      syncedEmail: contact.email,
    })
  })
  await t.mutation(emailRefs.contacts.ensureForUser, { userId })
  const summary = await t.run((ctx) => summarizeEmailAudience(ctx))
  expect(summary.pendingSync).toBe(1)
})

it('rejects an old sync acknowledgement after account deactivation', async () => {
  const { t, userId, contact } = await setup()
  await t.run((ctx) => ctx.db.patch(userId, { deactivatedAt: Date.now() }))
  await t.mutation(emailRefs.contacts.ensureForUser, { userId })
  const result = await t.mutation(emailRefs.contacts.markSyncAttempt, {
    contactId: contact._id,
    expectedPreferenceVersion: contact.preferenceVersion,
    providerContactId: 'provider_1',
    syncedEmail: contact.email,
    status: 'synced',
    error: null,
  })
  expect(result.applied).toBe(false)
})

it('queues provider cleanup when a stale worker finishes after local purge', async () => {
  const { t, contact } = await setup()
  await t.run((ctx) => ctx.db.delete(contact._id))

  const result = (await t.mutation(emailRefs.contacts.markSyncAttempt, {
    contactId: contact._id,
    expectedPreferenceVersion: contact.preferenceVersion,
    providerContactId: 'orphaned_provider_contact',
    syncedEmail: contact.email,
    status: 'synced',
    error: null,
  })) as { applied: boolean; cleanupQueued?: boolean }

  expect(result).toEqual({ applied: false, cleanupQueued: true })
})

it('queues provider cleanup when a stale worker finishes after contact state changes', async () => {
  const { t, contact } = await setup()
  await t.run((ctx) =>
    ctx.db.patch(contact._id, {
      stateVersion: (contact.stateVersion ?? contact.preferenceVersion) + 1,
      syncStatus: 'pending',
    }),
  )

  const result = await t.mutation(emailRefs.contacts.markSyncAttempt, {
    contactId: contact._id,
    expectedPreferenceVersion:
      contact.stateVersion ?? contact.preferenceVersion,
    providerContactId: 'stale_provider_contact',
    syncedEmail: contact.email,
    status: 'synced',
    error: null,
  })

  expect(result).toEqual({ applied: false, cleanupQueued: true })
  const cleanups = await t.run((ctx) =>
    ctx.db.query('email_contact_cleanups').take(10),
  )
  expect(cleanups).toHaveLength(1)
  expect(cleanups[0]?.providerContactId).toBe('stale_provider_contact')
})

it('refreshes an unsent review after pending contact sync completes', async () => {
  const { t, admin, contact, campaignId } = await setup()
  const args = {
    campaignId,
    expectedRevision: 2,
    html: '<p>Update</p>',
    text: 'Update',
  }
  await admin.mutation(emailRefs.campaigns.commitReview, args)
  await t.mutation(emailRefs.contacts.markSyncAttempt, {
    contactId: contact._id,
    expectedPreferenceVersion: contact.preferenceVersion,
    providerContactId: 'provider_1',
    syncedEmail: contact.email,
    status: 'synced',
    error: null,
  })
  const runId = await admin.mutation(emailRefs.campaigns.commitReview, args)
  const run = await t.run((ctx) => ctx.db.get(runId))
  expect(run?.audienceSummary).toMatchObject({ eligible: 1, pendingSync: 0 })
})

it('prevents editing a delivery that needs attention', async () => {
  const { t, admin, campaignId } = await setup()
  const runId = await admin.mutation(emailRefs.campaigns.commitReview, {
    campaignId,
    expectedRevision: 2,
    html: '<p>Update</p>',
    text: 'Update',
  })
  await t.mutation(emailRefs.delivery.markStage, {
    runId,
    stage: 'needs_attention',
    error: 'Broadcast send outcome is unknown',
  })
  await expect(
    admin.mutation(emailRefs.campaigns.saveDraft, {
      campaignId,
      expectedRevision: 2,
      title: 'Update',
      content,
    }),
  ).rejects.toThrow()
})

it('keeps failed contact sync available for recovery', async () => {
  const { t, contact } = await setup()
  await t.mutation(emailRefs.contacts.markSyncAttempt, {
    contactId: contact._id,
    expectedPreferenceVersion: contact.preferenceVersion,
    providerContactId: null,
    syncedEmail: null,
    status: 'failed',
    error: 'rate_limit_exceeded (429)',
  })
  const pending = await t.query(emailRefs.contacts.listPending, { limit: 50 })
  expect(pending.map((row) => row.contactId)).toContain(contact._id)
})

function configureProvider() {
  for (const [key, value] of Object.entries({
    RESEND_API_KEY: 're_test',
    EMAIL_FROM: 'Locatic <news@example.test>',
    EMAIL_REPLY_TO: 'reply@example.test',
    RESEND_SEGMENT_ID: 'segment',
    RESEND_TOPIC_ID: 'topic',
    EMAIL_CONTACT_SYNC_ENABLED: 'true',
  })) {
    vi.stubEnv(key, value)
  }
  provider.contacts.get.mockReset().mockResolvedValue({
    data: null,
    error: { name: 'not_found' },
  })
  provider.contacts.create.mockReset().mockResolvedValue({
    data: { id: 'new_provider' },
    error: null,
  })
  provider.contacts.remove.mockReset().mockResolvedValue({
    data: { id: 'provider', deleted: true },
    error: null,
  })
  provider.contacts.topics.update.mockReset().mockResolvedValue({
    data: { id: 'provider' },
    error: null,
  })
  provider.contacts.topics.list.mockReset().mockResolvedValue({
    data: { data: [{ id: 'topic', subscription: 'opt_out' }] },
    error: null,
  })
  provider.contacts.segments.add.mockReset().mockResolvedValue({
    data: { id: 'provider' },
    error: null,
  })
  provider.contacts.segments.remove.mockReset().mockResolvedValue({
    data: { id: 'provider' },
    error: null,
  })
}

it('retains old provider identity when old-address removal fails', async () => {
  const { t, contact } = await setup()
  configureProvider()
  await t.run((ctx) =>
    ctx.db.patch(contact._id, {
      providerContactId: 'old_provider',
      syncedEmail: 'old@example.test',
    }),
  )
  provider.contacts.topics.update.mockResolvedValue({
    data: null,
    error: { name: 'rate_limit_exceeded' },
  })
  provider.contacts.segments.remove.mockResolvedValue({
    data: null,
    error: { name: 'rate_limit_exceeded' },
  })
  await t.action(emailRefs.delivery.reconcileContacts, { limit: 50 })
  const row = await t.run((ctx) => ctx.db.get(contact._id))
  expect(row).toMatchObject({
    providerContactId: 'old_provider',
    syncStatus: 'failed',
  })
})

it('does not overwrite a provider topic opt-out during ordinary sync', async () => {
  const { t, contact } = await setup()
  configureProvider()
  await t.run((ctx) =>
    ctx.db.patch(contact._id, {
      providerContactId: 'provider',
      syncedEmail: contact.email,
      acknowledgedVersion: contact.preferenceVersion,
    }),
  )
  await t.action(emailRefs.delivery.reconcileContacts, { limit: 50 })
  expect(provider.contacts.topics.update).not.toHaveBeenCalledWith(
    expect.objectContaining({
      topics: [{ id: 'topic', subscription: 'opt_in' }],
    }),
  )
})

it('treats provider not-found as successful cleanup and removes the tombstone', async () => {
  const { t, contact } = await setup()
  configureProvider()
  await t.run((ctx) => ctx.db.delete(contact._id))
  await t.mutation(emailRefs.contacts.markSyncAttempt, {
    contactId: contact._id,
    expectedPreferenceVersion: contact.preferenceVersion,
    providerContactId: 'already_deleted_provider_contact',
    syncedEmail: contact.email,
    status: 'synced',
    error: null,
  })
  provider.contacts.remove.mockResolvedValue({
    data: null,
    error: { name: 'not_found' },
  })

  await t.action(emailRefs.delivery.reconcileContactCleanups, { limit: 2 })

  const cleanups = await t.run((ctx) =>
    ctx.db.query('email_contact_cleanups').take(10),
  )
  expect(cleanups).toEqual([])
})

it('retains a cleanup tombstone and schedules a retry after a transient failure', async () => {
  const { t, contact } = await setup()
  configureProvider()
  await t.run((ctx) => ctx.db.delete(contact._id))
  await t.mutation(emailRefs.contacts.markSyncAttempt, {
    contactId: contact._id,
    expectedPreferenceVersion: contact.preferenceVersion,
    providerContactId: 'retry_cleanup_contact',
    syncedEmail: contact.email,
    status: 'synced',
    error: null,
  })
  provider.contacts.remove.mockResolvedValue({
    data: null,
    error: { name: 'rate_limit_exceeded', statusCode: 429 },
  })

  await t.action(emailRefs.delivery.reconcileContactCleanups, { limit: 2 })

  const cleanup = await t.run((ctx) =>
    ctx.db.query('email_contact_cleanups').first(),
  )
  expect(cleanup).toMatchObject({
    providerContactId: 'retry_cleanup_contact',
    status: 'failed',
    retryCount: 1,
  })
  expect(cleanup?.nextRetryAt).toBeGreaterThan(Date.now())
})

it('retains only a cleanup identifier when account purge removes a provider contact', async () => {
  const { t, userId, contact } = await setup()
  await t.run(async (ctx) => {
    await ctx.db.patch(contact._id, {
      providerContactId: 'provider_to_delete',
      syncedEmail: contact.email,
    })
    await ctx.db.patch(userId, {
      deletedAt: Date.now() - 1_000,
      deactivatedAt: Date.now() - 1_000,
      purgeAfter: Date.now() - 1,
    })
  })

  await t.mutation(internal.users.scrubDeletedAccount, { userId })

  const result = await t.run(async (ctx) => ({
    contact: await ctx.db.get(contact._id),
    cleanups: await ctx.db.query('email_contact_cleanups').take(10),
  }))
  expect(result.contact).toBeNull()
  expect(result.cleanups).toHaveLength(1)
  expect(result.cleanups[0]).toMatchObject({
    providerContactId: 'provider_to_delete',
    status: 'pending',
  })
  expect(result.cleanups[0]).not.toHaveProperty('email')
  expect(result.cleanups[0]).not.toHaveProperty('userId')
})
