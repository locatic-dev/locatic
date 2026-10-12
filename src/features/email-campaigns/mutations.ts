import { useAction, useMutation } from 'convex/react'

import { api } from '../../../convex/_generated/api'

export const useCreateEmailCampaign = () =>
  useMutation(api.emailCampaigns.createDraft)
export const useSaveEmailCampaign = () =>
  useMutation(api.emailCampaigns.saveDraft)
export const usePreviewEmailCampaign = () =>
  useAction(api.emailRender.previewCampaign)
export const useSendEmailTest = () => useAction(api.emailRender.sendTest)
export const useRequestEmailSend = () => useAction(api.emailRender.requestSend)
export const useCancelEmailSend = () =>
  useMutation(api.emailCampaigns.cancelSend)
export const useResumeEmailSend = () =>
  useMutation(api.emailCampaigns.resumeSend)
