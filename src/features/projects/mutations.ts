import { useAction, useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'

export const useLikeProject = () => useAction(api.github_actions.likeProject)
export const useUnlikeProject = () =>
  useAction(api.github_actions.unlikeProject)

export const useAddComment = () => useMutation(api.comments.create)
export const useDeleteComment = () => useMutation(api.comments.remove)
export const useReactToTarget = () => useMutation(api.reactions.reactToTarget)
export const useUnreactFromTarget = () =>
  useMutation(api.reactions.unreactFromTarget)
export const usePinOwnedProject = () =>
  useMutation(api.projects.pinOwnedProject)
export const useUpdateProjectVisibility = () =>
  useMutation(api.projects.updateVisibility)
