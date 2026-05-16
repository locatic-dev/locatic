import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'

export const useCompleteOnboarding = () =>
  useMutation(api.users.completeOnboarding)
export const useUpdateProjectVisibility = () =>
  useMutation(api.projects.updateVisibility)
