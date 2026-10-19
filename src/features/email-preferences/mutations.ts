import { useMutation } from 'convex/react'

import { api } from '../../../convex/_generated/api'

export const useUnsubscribeWithToken = () =>
  useMutation(api.emailPreferences.unsubscribeWithToken)
export const useStopAllWithToken = () =>
  useMutation(api.emailPreferences.stopAllWithToken)
