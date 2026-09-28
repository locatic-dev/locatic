'use node'

import { Resend } from 'resend'
import { ConvexError, v } from 'convex/values'

import { action, internalAction } from './_generated/server'
import { normalizeEmailAddress } from './lib/email_contacts'
import {
  compactProviderError,
  getEmailProviderConfig,
  isTransientProviderError,
} from './lib/email_provider'
import { emailRefs } from './lib/email_function_refs'
import { enforceRateLimit } from './lib/rate_limits'
import { reconcileBroadcastStatus } from './lib/resend_contract'

const TEST_UNSUBSCRIBE_URL =
  'https://locatic.dev/settings?tab=notifications&email_test=1'
const CONTACT_SYNC_BATCH_LIMIT = 2
const PROVIDER_LIST_PAGE_LIMIT = 100
const PROVIDER_LIST_MAX_PAGES = 10

async function findSegmentsByName(resend: Resend, name: string) {
  const matches: Array<{ id: string; name: string }> = []
  let after: string | undefined
  for (let page = 0; page < PROVIDER_LIST_MAX_PAGES; page += 1) {
    const result = await resend.segments.list({
      limit: PROVIDER_LIST_PAGE_LIMIT,
      ...(after ? { after } : {}),
    })
    if (result.error || !result.data) {
      throw result.error ?? new Error('Segment listing returned no data')
    }
    matches.push(...result.data.data.filter((segment) => segment.name === name))
    if (!result.data.has_more) return matches
    const last = result.data.data.at(-1)
    if (!last) throw new Error('Segment listing did not advance its cursor')
    after = last.id
  }
  throw new Error('Segment reconciliation exceeded its bounded page limit')
}

async function findBroadcastsByIdentity(
  resend: Resend,
  name: string,
  segmentId: string,
) {
  const matches: Array<{ id: string; status: unknown }> = []
  let after: string | undefined
  for (let page = 0; page < PROVIDER_LIST_MAX_PAGES; page += 1) {
    const result = await resend.broadcasts.list({
      limit: PROVIDER_LIST_PAGE_LIMIT,
      ...(after ? { after } : {}),
    })
    if (result.error || !result.data) {
      throw result.error ?? new Error('Broadcast listing returned no data')
    }
    matches.push(
      ...result.data.data
        .filter(
          (broadcast) =>
            broadcast.name === name && broadcast.segment_id === segmentId,
        )
        .map((broadcast) => ({
          id: broadcast.id,
          status: broadcast.status,
        })),
    )
    if (!result.data.has_more) return matches
    const last = result.data.data.at(-1)
    if (!last) throw new Error('Broadcast listing did not advance its cursor')
    after = last.id
  }
  throw new Error('Broadcast reconciliation exceeded its bounded page limit')
}

export const dispatch = internalAction({
  args: { runId: v.id('email_campaign_runs') },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (process.env.EMAIL_SENDING_ENABLED !== 'true') {
      await ctx.runMutation(emailRefs.delivery.markStage, {
        runId: args.runId,
        stage: 'failed',
        error: 'Email sending is disabled in this environment',
      })
      return null
    }
    const config = getEmailProviderConfig()
    if (!config) {
      await ctx.runMutation(emailRefs.delivery.markStage, {
        runId: args.runId,
        stage: 'failed',
        error: 'Email provider configuration is incomplete',
      })
      return null
    }

    const decision = await ctx.runMutation(
      emailRefs.delivery.claimDispatch,
      args,
    )
    const context = await ctx.runQuery(emailRefs.delivery.getContext, args)
    if (!context || decision === 'stop') return null

    const resend = new Resend(config.apiKey)
    const providerBroadcastName = `locatic-campaign-${context.runId}`
    const providerSegmentName = `locatic-campaign-${context.runId}`

    if (decision === 'cleanup_segment') {
      try {
        if (context.providerSegmentId) {
          const removed = await resend.segments.remove(
            context.providerSegmentId,
          )
          if (removed.error && removed.error.name !== 'not_found') {
            throw removed.error
          }
        } else {
          const matches = await findSegmentsByName(resend, providerSegmentName)
          for (const segment of matches) {
            const removed = await resend.segments.remove(segment.id)
            if (removed.error && removed.error.name !== 'not_found') {
              throw removed.error
            }
          }
          if (matches.length === 0) {
            await ctx.runMutation(emailRefs.delivery.markSegmentCleaned, {
              runId: context.runId,
              cleaned: false,
              error: 'No provider segment is visible yet; cleanup will retry.',
            })
            return null
          }
        }
        await ctx.runMutation(emailRefs.delivery.markSegmentCleaned, {
          runId: context.runId,
          cleaned: true,
          error: null,
        })
      } catch (error) {
        await ctx.runMutation(emailRefs.delivery.markSegmentCleaned, {
          runId: context.runId,
          cleaned: false,
          error: compactProviderError(error),
        })
      }
      return null
    }

    let reconciledSegmentId: string | null = null
    if (decision === 'reconcile_segment') {
      try {
        const matches = await findSegmentsByName(resend, providerSegmentName)
        if (matches.length !== 1 || !matches[0]) {
          await ctx.runMutation(emailRefs.delivery.markSegmentUnknown, {
            runId: context.runId,
            error:
              matches.length === 0
                ? 'No matching provider segment is visible yet. Reconcile again before retrying.'
                : 'Multiple matching provider segments require cancellation and cleanup.',
          })
          return null
        }
        reconciledSegmentId = matches[0].id
        await ctx.runMutation(emailRefs.delivery.adoptSegment, {
          runId: context.runId,
          providerSegmentId: reconciledSegmentId,
        })
      } catch (error) {
        await ctx.runMutation(emailRefs.delivery.markSegmentUnknown, {
          runId: context.runId,
          error: `Provider segment reconciliation failed: ${compactProviderError(error)}`,
        })
        return null
      }
    }

    if (decision === 'reconcile') {
      const providerId = context.providerBroadcastId
      if (!providerId) return null
      try {
        const result = await resend.broadcasts.get(providerId)
        if (result.error || !result.data) {
          await ctx.runMutation(emailRefs.delivery.markStage, {
            runId: context.runId,
            stage: 'needs_attention',
            error: compactProviderError(result.error),
          })
          return null
        }
        const stage = reconcileBroadcastStatus(result.data.status)
        await ctx.runMutation(emailRefs.delivery.markStage, {
          runId: context.runId,
          stage:
            stage === 'ready'
              ? 'needs_attention'
              : stage === 'cancelled'
                ? 'cancelled'
                : stage,
          error:
            stage === 'ready'
              ? 'Provider still reports a draft after an uncertain send.'
              : null,
        })
      } catch (error) {
        await ctx.runMutation(emailRefs.delivery.markStage, {
          runId: context.runId,
          stage: 'needs_attention',
          error: compactProviderError(error),
        })
      }
      return null
    }

    let recoveredBroadcastId: string | null = null
    if (decision === 'recover_create') {
      try {
        const matches = await findBroadcastsByIdentity(
          resend,
          providerBroadcastName,
          context.providerSegmentId!,
        )
        if (matches.length !== 1 || !matches[0]) {
          await ctx.runMutation(emailRefs.delivery.markStage, {
            runId: context.runId,
            stage: 'needs_attention',
            error:
              matches.length === 0
                ? 'No matching provider draft is visible yet. Reconcile again before retrying.'
                : 'Multiple matching provider drafts require manual review.',
          })
          return null
        }
        recoveredBroadcastId = matches[0].id
        await ctx.runMutation(emailRefs.delivery.adoptBroadcast, {
          runId: context.runId,
          providerBroadcastId: recoveredBroadcastId,
        })
        const recoveredStage = reconcileBroadcastStatus(matches[0].status)
        if (recoveredStage !== 'ready') {
          await ctx.runMutation(emailRefs.delivery.markStage, {
            runId: context.runId,
            stage:
              recoveredStage === 'cancelled'
                ? 'cancelled'
                : recoveredStage === 'accepted'
                  ? 'accepted'
                  : 'needs_attention',
            error:
              recoveredStage === 'needs_attention'
                ? 'Provider returned an unknown broadcast status.'
                : null,
          })
          return null
        }
      } catch (error) {
        await ctx.runMutation(emailRefs.delivery.markStage, {
          runId: context.runId,
          stage: 'needs_attention',
          error: `Provider draft reconciliation failed: ${compactProviderError(error)}`,
        })
        return null
      }
    }

    let reviewedAudience
    try {
      reviewedAudience = await ctx.runQuery(
        emailRefs.campaigns.validateDispatchAudience,
        { runId: context.runId },
      )
      if (reviewedAudience.pendingSync > 0) {
        throw new Error('Contact synchronization changed after send approval')
      }
      if (reviewedAudience.recipients.length === 0) {
        throw new Error('No reviewed subscribers remain eligible')
      }
    } catch (error) {
      await ctx.runMutation(emailRefs.delivery.markStage, {
        runId: context.runId,
        stage: recoveredBroadcastId ? 'needs_attention' : 'failed',
        error: compactProviderError(error),
      })
      return null
    }

    let providerSegmentId = context.providerSegmentId ?? reconciledSegmentId
    if (!providerSegmentId) {
      try {
        const createdSegment = await resend.segments.create(
          { name: providerSegmentName },
          {
            headers: {
              'Idempotency-Key': `locatic-segment-${context.runId}`,
            },
          },
        )
        if (createdSegment.error || !createdSegment.data?.id) {
          if (
            createdSegment.error &&
            isTransientProviderError(createdSegment.error)
          ) {
            await ctx.runMutation(emailRefs.delivery.markSegmentUnknown, {
              runId: context.runId,
              error: `Audience segment creation outcome is unknown: ${compactProviderError(createdSegment.error)}`,
            })
            return null
          }
          await ctx.runMutation(emailRefs.delivery.markStage, {
            runId: context.runId,
            stage: 'failed',
            error: compactProviderError(
              createdSegment.error ??
                new Error('Segment creation returned no id'),
            ),
          })
          return null
        }
        providerSegmentId = createdSegment.data.id
        await ctx.runMutation(emailRefs.delivery.storeSegment, {
          runId: context.runId,
          providerSegmentId,
        })
      } catch (error) {
        await ctx.runMutation(emailRefs.delivery.markSegmentUnknown, {
          runId: context.runId,
          error: `Audience segment creation outcome is unknown: ${compactProviderError(error)}`,
        })
        return null
      }
    }

    for (const recipient of reviewedAudience.recipients) {
      try {
        const added = await resend.contacts.segments.add({
          contactId: recipient.providerContactId,
          segmentId: providerSegmentId,
        })
        if (added.error) throw added.error
      } catch (error) {
        await ctx.runMutation(emailRefs.delivery.markStage, {
          runId: context.runId,
          stage: recoveredBroadcastId ? 'needs_attention' : 'failed',
          error: compactProviderError(error),
        })
        return null
      }
    }

    try {
      const finalAudience = await ctx.runQuery(
        emailRefs.campaigns.validateDispatchAudience,
        { runId: context.runId },
      )
      const finalIds = new Set(
        finalAudience.recipients.map(
          (recipient) => recipient.providerContactId,
        ),
      )
      for (const recipient of reviewedAudience.recipients) {
        if (finalIds.has(recipient.providerContactId)) continue
        const removed = await resend.contacts.segments.remove({
          contactId: recipient.providerContactId,
          segmentId: providerSegmentId,
        })
        if (removed.error && removed.error.name !== 'not_found') {
          throw removed.error
        }
      }
      if (
        finalAudience.pendingSync > 0 ||
        finalAudience.recipients.length === 0
      ) {
        throw new Error('Reviewed audience changed before provider handoff')
      }
    } catch (error) {
      await ctx.runMutation(emailRefs.delivery.markStage, {
        runId: context.runId,
        stage: recoveredBroadcastId ? 'needs_attention' : 'failed',
        error: compactProviderError(error),
      })
      return null
    }

    let providerBroadcastId = recoveredBroadcastId
    if (!providerBroadcastId) {
      const claimed = await ctx.runMutation(
        emailRefs.delivery.claimBroadcastCreate,
        { runId: context.runId },
      )
      if (!claimed) return null
      try {
        const created = await resend.broadcasts.create(
          {
            segmentId: providerSegmentId,
            topicId: config.topicId,
            from: config.from,
            replyTo: config.replyTo,
            name: providerBroadcastName,
            subject: context.subject,
            previewText: context.preheader,
            html: context.html,
            text: context.text,
          },
          {
            headers: {
              'Idempotency-Key': `locatic-broadcast-${context.runId}`,
            },
          },
        )
        if (created.error || !created.data?.id) {
          if (created.error && isTransientProviderError(created.error)) {
            await ctx.runMutation(emailRefs.delivery.markBroadcastUnknown, {
              runId: context.runId,
              error: `Broadcast creation outcome is unknown: ${compactProviderError(created.error)}`,
            })
            return null
          }
          await ctx.runMutation(emailRefs.delivery.markStage, {
            runId: context.runId,
            stage: 'failed',
            error: compactProviderError(created.error),
          })
          return null
        }
        providerBroadcastId = created.data.id
        await ctx.runMutation(emailRefs.delivery.storeBroadcast, {
          runId: context.runId,
          providerBroadcastId,
        })
      } catch (error) {
        await ctx.runMutation(emailRefs.delivery.markBroadcastUnknown, {
          runId: context.runId,
          error: `Broadcast creation outcome is unknown: ${compactProviderError(error)}`,
        })
        await ctx.scheduler.runAfter(5_000, emailRefs.delivery.dispatch, {
          runId: context.runId,
        })
        return null
      }
    }

    const claimedSend = await ctx.runMutation(
      emailRefs.delivery.claimBroadcastSend,
      { runId: context.runId },
    )
    if (!claimedSend) return null
    try {
      const sent = await resend.broadcasts.send(providerBroadcastId)
      if (sent.error) {
        await ctx.runMutation(emailRefs.delivery.markBroadcastUnknown, {
          runId: context.runId,
          error: compactProviderError(sent.error),
        })
        await ctx.scheduler.runAfter(5_000, emailRefs.delivery.dispatch, {
          runId: context.runId,
        })
        return null
      }
      await ctx.runMutation(emailRefs.delivery.markStage, {
        runId: context.runId,
        stage: 'accepted',
        error: null,
      })
    } catch (error) {
      await ctx.runMutation(emailRefs.delivery.markBroadcastUnknown, {
        runId: context.runId,
        error: `Broadcast send outcome is unknown: ${compactProviderError(error)}`,
      })
      await ctx.scheduler.runAfter(5_000, emailRefs.delivery.dispatch, {
        runId: context.runId,
      })
    }
    return null
  },
})

export const reconcileContacts = internalAction({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ processed: v.number(), disabled: v.boolean() }),
  handler: async (ctx, args) => {
    const config = getEmailProviderConfig()
    if (!config || process.env.EMAIL_CONTACT_SYNC_ENABLED !== 'true') {
      return { processed: 0, disabled: true }
    }
    // A contact can require up to four provider requests. Two contacts per
    // second keeps the worker below Resend's documented default request rate.
    const limit = Math.min(
      Math.max(args.limit ?? CONTACT_SYNC_BATCH_LIMIT, 1),
      CONTACT_SYNC_BATCH_LIMIT,
    )
    const contacts = await ctx.runMutation(emailRefs.contacts.claimPending, {
      limit,
    })
    const resend = new Resend(config.apiKey)

    for (const contact of contacts) {
      let providerContactId = contact.providerContactId
      try {
        if (
          providerContactId &&
          contact.syncedEmail &&
          contact.syncedEmail !== contact.normalizedEmail
        ) {
          const topic = await resend.contacts.topics.update({
            id: providerContactId,
            topics: [{ id: config.topicId, subscription: 'opt_out' }],
          })
          if (topic.error) throw topic.error
          const segment = await resend.contacts.segments.remove({
            contactId: providerContactId,
            segmentId: config.segmentId,
          })
          if (segment.error && segment.error.name !== 'not_found') {
            throw segment.error
          }
          const removedContact = await resend.contacts.remove(providerContactId)
          if (
            removedContact.error &&
            removedContact.error.name !== 'not_found'
          ) {
            throw removedContact.error
          }
          providerContactId = null
        }

        if (contact.desiredSubscribed) {
          if (!providerContactId) {
            const existing = await resend.contacts.get({
              email: contact.normalizedEmail,
            })
            if (existing.data?.unsubscribed) {
              await ctx.runMutation(emailRefs.contacts.applyProviderState, {
                eventId: `reconcile:${contact.contactId}:${contact.stateVersion}`,
                email: contact.normalizedEmail,
                providerContactId: existing.data.id,
                providerUnsubscribed: true,
              })
              continue
            }
            if (existing.error && existing.error.name !== 'not_found') {
              throw existing.error
            }
            providerContactId = existing.data?.id ?? null
          }
          if (!providerContactId) {
            const created = await resend.contacts.create({
              email: contact.normalizedEmail,
              segments: [{ id: config.segmentId }],
              topics: [{ id: config.topicId, subscription: 'opt_in' }],
            })
            if (created.error || !created.data) {
              throw (
                created.error ?? new Error('Contact creation returned no id')
              )
            }
            providerContactId = created.data.id
          } else {
            const topics = await resend.contacts.topics.list({
              id: providerContactId,
            })
            if (topics.error) throw topics.error
            const providerTopic = topics.data?.data.find(
              (topic) => topic.id === config.topicId,
            )
            if (
              providerTopic?.subscription === 'opt_out' &&
              !contact.allowProviderResubscribe
            ) {
              await ctx.runMutation(emailRefs.contacts.applyProviderState, {
                eventId: `topic-opt-out:${contact.contactId}:${contact.stateVersion}`,
                email: contact.normalizedEmail,
                providerContactId,
                providerUnsubscribed: true,
              })
              continue
            }
            if (providerTopic?.subscription !== 'opt_in') {
              const topic = await resend.contacts.topics.update({
                id: providerContactId,
                topics: [{ id: config.topicId, subscription: 'opt_in' }],
              })
              if (topic.error) throw topic.error
            }
            const segment = await resend.contacts.segments.add({
              contactId: providerContactId,
              segmentId: config.segmentId,
            })
            if (segment.error) throw segment.error
          }
        } else if (providerContactId) {
          const topic = await resend.contacts.topics.update({
            id: providerContactId,
            topics: [{ id: config.topicId, subscription: 'opt_out' }],
          })
          if (topic.error) throw topic.error
          const segment = await resend.contacts.segments.remove({
            contactId: providerContactId,
            segmentId: config.segmentId,
          })
          if (segment.error && segment.error.name !== 'not_found') {
            throw segment.error
          }
        }

        await ctx.runMutation(emailRefs.contacts.markSyncAttempt, {
          contactId: contact.contactId,
          expectedPreferenceVersion: contact.stateVersion,
          claimToken: contact.claimToken,
          providerContactId,
          syncedEmail: contact.normalizedEmail,
          status: 'synced',
          error: null,
        })
      } catch (error) {
        await ctx.runMutation(emailRefs.contacts.markSyncAttempt, {
          contactId: contact.contactId,
          expectedPreferenceVersion: contact.stateVersion,
          claimToken: contact.claimToken,
          providerContactId,
          syncedEmail: contact.syncedEmail,
          status: 'failed',
          retryable: isTransientProviderError(error),
          error: compactProviderError(error),
        })
      }
    }

    if (contacts.length > 0) {
      await ctx.scheduler.runAfter(
        1_000,
        emailRefs.delivery.reconcileContacts,
        {
          limit,
        },
      )
    }
    return { processed: contacts.length, disabled: false }
  },
})

export const reconcileContactCleanups = internalAction({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ processed: v.number(), disabled: v.boolean() }),
  handler: async (ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY?.trim()
    if (!apiKey) {
      return { processed: 0, disabled: true }
    }
    const cleanups = await ctx.runMutation(emailRefs.contacts.claimCleanups, {
      limit: Math.min(Math.max(args.limit ?? 2, 1), 10),
    })
    const resend = new Resend(apiKey)
    for (const cleanup of cleanups) {
      try {
        const result = await resend.contacts.remove(cleanup.providerContactId)
        if (result.error && result.error.name !== 'not_found') {
          throw result.error
        }
        await ctx.runMutation(emailRefs.contacts.markCleanupAttempt, {
          cleanupId: cleanup.cleanupId,
          claimToken: cleanup.claimToken,
          deleted: true,
          error: null,
        })
      } catch (error) {
        await ctx.runMutation(emailRefs.contacts.markCleanupAttempt, {
          cleanupId: cleanup.cleanupId,
          claimToken: cleanup.claimToken,
          deleted: false,
          retryable: isTransientProviderError(error),
          error: compactProviderError(error),
        })
      }
    }
    if (cleanups.length > 0) {
      await ctx.scheduler.runAfter(
        1_000,
        emailRefs.delivery.reconcileContactCleanups,
        { limit: args.limit },
      )
    }
    return { processed: cleanups.length, disabled: false }
  },
})

export const recoverDeliveries = internalAction({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ scheduled: v.number() }),
  handler: async (ctx, args) => {
    const runIds = await ctx.runQuery(emailRefs.delivery.listRecoverable, {
      limit: args.limit,
    })
    for (const runId of runIds) {
      await ctx.scheduler.runAfter(0, emailRefs.delivery.dispatch, { runId })
    }
    return { scheduled: runIds.length }
  },
})

export const sendTest = action({
  args: {
    reviewId: v.id('email_campaign_runs'),
    recipient: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    if (process.env.EMAIL_TEST_SENDING_ENABLED !== 'true') {
      throw new ConvexError('Test email sending is disabled')
    }
    const config = getEmailProviderConfig()
    if (!config)
      throw new ConvexError('Email provider configuration is incomplete')
    const artifact = await ctx.runQuery(emailRefs.delivery.getTestArtifact, {
      reviewId: args.reviewId,
    })
    if (!artifact) throw new ConvexError('Reviewed campaign not found')
    await enforceRateLimit(ctx, 'emailTestSend', String(artifact.adminId))

    const recipient = normalizeEmailAddress(args.recipient)
    const allowed = new Set(
      (process.env.EMAIL_TEST_RECIPIENTS ?? '')
        .split(',')
        .map(normalizeEmailAddress)
        .filter(Boolean),
    )
    if (!allowed.has(recipient)) {
      throw new ConvexError('Test recipient is not allowlisted')
    }

    const resend = new Resend(config.apiKey)
    const response = await resend.emails.send({
      from: config.from,
      replyTo: config.replyTo,
      to: recipient,
      subject: `[test] ${artifact.subject}`,
      html: artifact.html.replaceAll(
        '{{{RESEND_UNSUBSCRIBE_URL}}}',
        TEST_UNSUBSCRIBE_URL,
      ),
      text: artifact.text.replaceAll(
        '{{{RESEND_UNSUBSCRIBE_URL}}}',
        TEST_UNSUBSCRIBE_URL,
      ),
    })
    if (response.error || !response.data?.id) {
      throw new ConvexError(compactProviderError(response.error))
    }
    return response.data.id
  },
})
