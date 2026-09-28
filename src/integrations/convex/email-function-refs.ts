import {
  makeFunctionReference,
  type DefaultFunctionArgs,
  type FunctionType,
} from 'convex/server'

import type { Id } from '../../../convex/_generated/dataModel'
import type { Doc } from '../../../convex/lib/types'

// See convex/lib/email_function_refs.ts. This client-only bridge avoids
// checking in deployment-generated API output while preserving typed calls.

function ref<
  TType extends FunctionType,
  TArgs extends DefaultFunctionArgs,
  TReturn,
>(name: string) {
  return makeFunctionReference<TType, TArgs, TReturn>(name)
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
type RunSummary = {
  id: Id<'email_campaign_runs'>
  revision: number
  stage: Doc<'email_campaign_runs'>['stage']
  audienceSummary: Doc<'email_campaign_runs'>['audienceSummary']
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

export const emailClientRefs = {
  campaigns: {
    createDraft: ref<
      'mutation',
      { kind: Doc<'email_campaigns'>['kind']; title: string },
      Id<'email_campaigns'>
    >('emailCampaigns:createDraft'),
    saveDraft: ref<
      'mutation',
      {
        campaignId: Id<'email_campaigns'>
        expectedRevision: number
        title: string
        content: CampaignContent
      },
      number
    >('emailCampaigns:saveDraft'),
    list: ref<'query', Record<string, never>, CampaignSummary[]>(
      'emailCampaigns:list',
    ),
    get: ref<
      'query',
      { campaignId: Id<'email_campaigns'> },
      CampaignDetail | null
    >('emailCampaigns:get'),
    searchProjects: ref<
      'query',
      { query: string },
      CampaignContent['projects']
    >('emailCampaigns:searchProjects'),
    requestSend: ref<
      'mutation',
      {
        campaignId: Id<'email_campaigns'>
        reviewedRevision: number
        reviewId: Id<'email_campaign_runs'>
      },
      Id<'email_campaign_runs'>
    >('emailCampaigns:requestSend'),
  },
  contacts: {
    myStatus: ref<
      'query',
      Record<string, never>,
      {
        subscribed: boolean
        emailVerified: boolean
        syncStatus: 'not_started' | Doc<'email_contacts'>['syncStatus']
        suppression: Doc<'email_contacts'>['suppression']
        lastError: string | null
      }
    >('emailContacts:myStatus'),
    retryFailed: ref<'mutation', { limit?: number }, { retried: number }>(
      'emailContacts:retryFailed',
    ),
  },
  delivery: {
    recover: ref<
      'mutation',
      { runId: Id<'email_campaign_runs'> },
      'scheduled' | 'accepted'
    >('emailDeliveryState:recover'),
    cancel: ref<'mutation', { runId: Id<'email_campaign_runs'> }, 'cancelled'>(
      'emailDeliveryState:cancel',
    ),
    sendTest: ref<
      'action',
      { reviewId: Id<'email_campaign_runs'>; recipient: string },
      string
    >('emailDelivery:sendTest'),
  },
  render: {
    prepareReview: ref<
      'action',
      { campaignId: Id<'email_campaigns'>; expectedRevision: number },
      Id<'email_campaign_runs'>
    >('emailRender:prepareReview'),
  },
} as const
