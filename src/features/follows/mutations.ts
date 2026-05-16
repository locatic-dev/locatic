import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'

export const useFollowUser = () => useMutation(api.follows.follow)
export const useUnfollowUser = () => useMutation(api.follows.unfollow)
