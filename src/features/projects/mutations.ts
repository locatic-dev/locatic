import { useAction, useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'

export const useLikeProject = () => useAction(api.github_actions.likeProject)
export const useUnlikeProject = () =>
  useAction(api.github_actions.unlikeProject)
/** Owner-only, rate-limited metadata refresh (the retry for a failed sync). */
export const useRefreshProjectMetadata = () =>
  useAction(api.projects.refreshMetadata)

export const useAddComment = () => useMutation(api.comments.create)
export const useDeleteComment = () => useMutation(api.comments.remove)
export const useReactToTarget = () => useMutation(api.reactions.reactToTarget)
export const useUnreactFromTarget = () =>
  useMutation(api.reactions.unreactFromTarget)
export const useCreatePost = () => useMutation(api.posts.create)
export const useUpdatePost = () => useMutation(api.posts.update)
export const useDeletePost = () => useMutation(api.posts.remove)
export const usePinOwnedProject = () =>
  useMutation(api.projects.pinOwnedProject)
export const useUpdateProjectTopics = () =>
  useMutation(api.projects.updateTopics)
export const useUpdateProjectVisibility = () =>
  useMutation(api.projects.updateVisibility)
