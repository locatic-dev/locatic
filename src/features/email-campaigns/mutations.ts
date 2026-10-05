import { useAction, useMutation } from 'convex/react'

import { emailClientRefs } from '@/integrations/convex/email-function-refs'

export const useCreateEmailCampaign = () =>
  useMutation(emailClientRefs.campaigns.createDraft)
export const useSaveEmailCampaign = () =>
  useMutation(emailClientRefs.campaigns.saveDraft)
export const usePrepareEmailCampaignReview = () =>
  useAction(emailClientRefs.render.prepareReview)
export const useSendEmailCampaignTest = () =>
  useAction(emailClientRefs.delivery.sendTest)
export const useRequestEmailCampaignSend = () =>
  useMutation(emailClientRefs.campaigns.requestSend)
export const useRecoverEmailCampaignDelivery = () =>
  useMutation(emailClientRefs.delivery.recover)
export const useCancelEmailCampaignDelivery = () =>
  useMutation(emailClientRefs.delivery.cancel)
export const useRetryFailedEmailContacts = () =>
  useMutation(emailClientRefs.contacts.retryFailed)
