import {
  makeFunctionReference,
  type DefaultFunctionArgs,
  type FunctionReference,
  type FunctionType,
} from 'convex/server'

import type { Id } from '../_generated/dataModel'
import type { Doc } from './types'

// Convex codegen is deployment-backed in this repository. Keep this small,
// typed bridge until CI can generate `_generated/api` without contacting a
// configured deployment; the server and client contracts below are tested by
// TypeScript and the focused email suites.

function publicRef<
  TType extends FunctionType,
  TArgs extends DefaultFunctionArgs,
  TReturn,
>(name: string) {
  return makeFunctionReference<TType, TArgs, TReturn>(name)
}

function internalRef<
  TType extends FunctionType,
  TArgs extends DefaultFunctionArgs,
  TReturn,
>(name: string) {
  return makeFunctionReference<TType, TArgs, TReturn>(
    name,
  ) as unknown as FunctionReference<TType, 'internal', TArgs, TReturn>
}

type CampaignContent = Doc<'email_campaigns'>['content']
type CampaignSummary = Pick<
  Doc<'email_campaigns'>,
  | 'kind'
  | 'title'
  | 'periodStart'
  | 'periodEnd'
  | 'revision'
  | 'state'
  | 'updatedAt'
> & { id: Id<'email_campaigns'> }
type AudienceSummary = Doc<'email_campaign_runs'>['audienceSummary']
type RunSummary = {
  id: Id<'email_campaign_runs'>
  revision: number
  stage: Doc<'email_campaign_runs'>['stage']
  audienceSummary: AudienceSummary
  html: string
  text: string
  providerBroadcastId: string | null
  canCancel: boolean
  metrics: Doc<'email_campaign_runs'>['metrics']
  lastError: string | null
  updatedAt: number
}
type CampaignDetail = CampaignSummary & {
  templateVersion: number
  content: CampaignContent
  preparationDiagnostics: string[]
  sender: string | null
  replyTo: string | null
  latestRun: RunSummary | null
}
type ContactStatus = {
  subscribed: boolean
  emailVerified: boolean
  syncStatus: 'not_started' | Doc<'email_contacts'>['syncStatus']
  suppression: Doc<'email_contacts'>['suppression']
  lastError: string | null
}
type PendingContact = {
  contactId: Id<'email_contacts'>
  userId: Id<'users'>
  email: string
  normalizedEmail: string
  desiredSubscribed: boolean
  preferenceVersion: number
  stateVersion: number
  claimToken?: string
  providerContactId: string | null
  syncedEmail: string | null
  providerUnsubscribed: boolean
  suppression: Doc<'email_contacts'>['suppression']
  allowProviderResubscribe?: boolean
}
type DeliveryContext = {
  runId: Id<'email_campaign_runs'>
  campaignId: Id<'email_campaigns'>
  campaignTitle: string
  preheader: string
  requestId: string
  stage: Doc<'email_campaign_runs'>['stage']
  subject: string
  html: string
  text: string
  providerBroadcastId: string | null
  providerSegmentId: string | null
  segmentPhase: NonNullable<Doc<'email_campaign_runs'>['segmentPhase']>
  broadcastPhase: NonNullable<Doc<'email_campaign_runs'>['broadcastPhase']>
  segmentCleanupAttempts: number
}

export const emailRefs = {
  campaigns: {
    createDraft: publicRef<
      'mutation',
      { kind: Doc<'email_campaigns'>['kind']; title: string },
      Id<'email_campaigns'>
    >('emailCampaigns:createDraft'),
    saveDraft: publicRef<
      'mutation',
      {
        campaignId: Id<'email_campaigns'>
        expectedRevision: number
        title: string
        content: CampaignContent
      },
      number
    >('emailCampaigns:saveDraft'),
    list: publicRef<'query', Record<string, never>, CampaignSummary[]>(
      'emailCampaigns:list',
    ),
    searchProjects: publicRef<
      'query',
      { query: string },
      CampaignContent['projects']
    >('emailCampaigns:searchProjects'),
    get: publicRef<
      'query',
      { campaignId: Id<'email_campaigns'> },
      CampaignDetail | null
    >('emailCampaigns:get'),
    getReviewInput: internalRef<
      'query',
      { campaignId: Id<'email_campaigns'>; expectedRevision: number },
      { content: CampaignContent } | null
    >('emailCampaigns:getReviewInput'),
    commitReview: internalRef<
      'mutation',
      {
        campaignId: Id<'email_campaigns'>
        expectedRevision: number
        html: string
        text: string
      },
      Id<'email_campaign_runs'>
    >('emailCampaigns:commitReview'),
    requestSend: publicRef<
      'mutation',
      {
        campaignId: Id<'email_campaigns'>
        reviewedRevision: number
        reviewId: Id<'email_campaign_runs'>
      },
      Id<'email_campaign_runs'>
    >('emailCampaigns:requestSend'),
    validateDispatchAudience: internalRef<
      'query',
      { runId: Id<'email_campaign_runs'> },
      {
        recipients: Array<{
          contactId: Id<'email_contacts'>
          providerContactId: string
        }>
        pendingSync: number
      }
    >('emailCampaigns:validateDispatchAudience'),
  },
  contacts: {
    myStatus: publicRef<'query', Record<string, never>, ContactStatus>(
      'emailContacts:myStatus',
    ),
    listPending: internalRef<'query', { limit?: number }, PendingContact[]>(
      'emailContacts:listPending',
    ),
    claimPending: internalRef<
      'mutation',
      { limit?: number; now?: number },
      Array<
        PendingContact & {
          claimToken: string
          allowProviderResubscribe: boolean
        }
      >
    >('emailContacts:claimPending'),
    ensureForUser: internalRef<
      'mutation',
      { userId: Id<'users'> },
      Id<'email_contacts'> | null
    >('emailContacts:ensureForUser'),
    markSyncAttempt: internalRef<
      'mutation',
      {
        contactId: Id<'email_contacts'>
        expectedPreferenceVersion: number
        claimToken?: string
        providerContactId: string | null
        syncedEmail: string | null
        status: 'synced' | 'failed'
        retryable?: boolean
        error: string | null
      },
      { applied: boolean; cleanupQueued: boolean }
    >('emailContacts:markSyncAttempt'),
    retryFailed: publicRef<'mutation', { limit?: number }, { retried: number }>(
      'emailContacts:retryFailed',
    ),
    claimCleanups: internalRef<
      'mutation',
      { limit?: number; now?: number },
      Array<{
        cleanupId: Id<'email_contact_cleanups'>
        providerContactId: string
        claimToken: string
      }>
    >('emailContacts:claimCleanups'),
    markCleanupAttempt: internalRef<
      'mutation',
      {
        cleanupId: Id<'email_contact_cleanups'>
        claimToken: string
        deleted: boolean
        retryable?: boolean
        error: string | null
      },
      { applied: boolean }
    >('emailContacts:markCleanupAttempt'),
    applyProviderState: internalRef<
      'mutation',
      {
        eventId: string
        email: string
        providerContactId: string | null
        providerUnsubscribed?: boolean
        suppression?: 'hard_bounce' | 'complaint' | 'provider_suppressed'
      },
      { status: 'applied' | 'ignored' }
    >('emailContacts:applyProviderState'),
  },
  delivery: {
    recover: publicRef<
      'mutation',
      { runId: Id<'email_campaign_runs'> },
      'scheduled' | 'accepted'
    >('emailDeliveryState:recover'),
    cancel: publicRef<
      'mutation',
      { runId: Id<'email_campaign_runs'> },
      'cancelled'
    >('emailDeliveryState:cancel'),
    dispatch: internalRef<'action', { runId: Id<'email_campaign_runs'> }, null>(
      'emailDelivery:dispatch',
    ),
    reconcileContacts: internalRef<
      'action',
      { limit?: number },
      { processed: number; disabled: boolean }
    >('emailDelivery:reconcileContacts'),
    reconcileContactCleanups: internalRef<
      'action',
      { limit?: number },
      { processed: number; disabled: boolean }
    >('emailDelivery:reconcileContactCleanups'),
    sendTest: publicRef<
      'action',
      { reviewId: Id<'email_campaign_runs'>; recipient: string },
      string
    >('emailDelivery:sendTest'),
    getContext: internalRef<
      'query',
      { runId: Id<'email_campaign_runs'> },
      DeliveryContext | null
    >('emailDeliveryState:getContext'),
    listRecoverable: internalRef<
      'query',
      { limit?: number },
      Id<'email_campaign_runs'>[]
    >('emailDeliveryState:listRecoverable'),
    recoverDeliveries: internalRef<
      'action',
      { limit?: number },
      { scheduled: number }
    >('emailDelivery:recoverDeliveries'),
    claimDispatch: internalRef<
      'mutation',
      { runId: Id<'email_campaign_runs'> },
      | 'create'
      | 'reconcile'
      | 'reconcile_segment'
      | 'recover_create'
      | 'cleanup_segment'
      | 'stop'
    >('emailDeliveryState:claimDispatch'),
    storeBroadcast: internalRef<
      'mutation',
      { runId: Id<'email_campaign_runs'>; providerBroadcastId: string },
      null
    >('emailDeliveryState:storeBroadcast'),
    adoptBroadcast: internalRef<
      'mutation',
      { runId: Id<'email_campaign_runs'>; providerBroadcastId: string },
      null
    >('emailDeliveryState:adoptBroadcast'),
    storeSegment: internalRef<
      'mutation',
      { runId: Id<'email_campaign_runs'>; providerSegmentId: string },
      null
    >('emailDeliveryState:storeSegment'),
    adoptSegment: internalRef<
      'mutation',
      { runId: Id<'email_campaign_runs'>; providerSegmentId: string },
      null
    >('emailDeliveryState:adoptSegment'),
    markSegmentUnknown: internalRef<
      'mutation',
      { runId: Id<'email_campaign_runs'>; error: string },
      null
    >('emailDeliveryState:markSegmentUnknown'),
    claimBroadcastCreate: internalRef<
      'mutation',
      { runId: Id<'email_campaign_runs'> },
      boolean
    >('emailDeliveryState:claimBroadcastCreate'),
    markBroadcastUnknown: internalRef<
      'mutation',
      { runId: Id<'email_campaign_runs'>; error: string },
      null
    >('emailDeliveryState:markBroadcastUnknown'),
    claimBroadcastSend: internalRef<
      'mutation',
      { runId: Id<'email_campaign_runs'> },
      boolean
    >('emailDeliveryState:claimBroadcastSend'),
    markSegmentCleaned: internalRef<
      'mutation',
      {
        runId: Id<'email_campaign_runs'>
        cleaned: boolean
        error: string | null
      },
      null
    >('emailDeliveryState:markSegmentCleaned'),
    markStage: internalRef<
      'mutation',
      {
        runId: Id<'email_campaign_runs'>
        stage: Doc<'email_campaign_runs'>['stage']
        error: string | null
      },
      null
    >('emailDeliveryState:markStage'),
    getTestArtifact: internalRef<
      'query',
      { reviewId: Id<'email_campaign_runs'> },
      {
        adminId: Id<'users'>
        subject: string
        html: string
        text: string
      } | null
    >('emailDeliveryState:getTestArtifact'),
  },
  digest: {
    configure: publicRef<
      'mutation',
      { anchorAt: number; enabled: boolean },
      null
    >('emailDigest:configure'),
    prepareDue: internalRef<
      'mutation',
      { now?: number },
      {
        status: 'disabled' | 'not_due' | 'exists' | 'created'
        campaignId: Id<'email_campaigns'> | null
      }
    >('emailDigest:prepareDue'),
  },
  events: {
    record: internalRef<
      'mutation',
      {
        eventId: string
        eventType: string
        email: string
        providerContactId: string | null
        providerBroadcastId: string | null
        providerEmailId: string | null
        providerUnsubscribed?: boolean
        suppression?: 'hard_bounce' | 'complaint' | 'provider_suppressed'
      },
      { status: 'processed' | 'duplicate' | 'ignored' }
    >('emailEvents:record'),
  },
  render: {
    prepareReview: publicRef<
      'action',
      { campaignId: Id<'email_campaigns'>; expectedRevision: number },
      Id<'email_campaign_runs'>
    >('emailRender:prepareReview'),
  },
} as const
