import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'

export const useUpdateProfile = () => useMutation(api.users.updateProfile)
export const useUpdatePrivacy = () => useMutation(api.users.updatePrivacy)
export const useUpdateNotificationPref = () =>
  useMutation(api.users.updateNotificationPref)
export const useUpdateEmailPreference = () =>
  useMutation(api.emailPreferences.updateEmailPreference)
export const useUpdateExploreConfig = () =>
  useMutation(api.users.updateExploreConfig)
export const useDeactivateAccount = () =>
  useMutation(api.users.deactivateAccount)
export const useDeleteAccount = () => useMutation(api.users.deleteAccount)
