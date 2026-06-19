import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'

export const useDismissExploreProject = () => useMutation(api.explore.dismiss)
export const useDismissExplorePost = () => useMutation(api.explore.dismissPost)
export const useResetExploreProjects = () =>
  useMutation(api.explore.resetDismissedProjects)
export const useResetExplorePosts = () =>
  useMutation(api.explore.resetDismissedPosts)
