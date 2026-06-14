import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'

export const useUpdateProfile = () => useMutation(api.users.updateProfile)
export const useUpdatePrivacy = () => useMutation(api.users.updatePrivacy)
export const useUpdateNotificationPrefs = () =>
  useMutation(api.users.updateNotificationPrefs)
export const useUpdateExploreConfig = () =>
  useMutation(api.users.updateExploreConfig)
export const useDeactivateAccount = () =>
  useMutation(api.users.deactivateAccount)
export const useDeleteAccount = () => useMutation(api.users.deleteAccount)
