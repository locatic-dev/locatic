import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Id } from '../../../convex/_generated/dataModel'
import { useFollowUser, useUnfollowUser } from '@/features/follows/mutations'
import { publicProfileOverviewQueryOptions } from '@/features/profile/queries'
import type { PublicProfileOverview } from '@/features/profile/types'
import { reportActionError } from '@/lib/action-error'
import { showUndoToast } from '@/lib/undo-toast'

type ProfileFollowVariables = {
  currentlyFollowed: boolean
  /** The route's username param, which keys the profile query. */
  username: string
  userId: Id<'users'>
}

const profileQueryKeyFor = (username: string) =>
  publicProfileOverviewQueryOptions(username).queryKey

/**
 * Follow and unfollow from a profile page. The profile payload updates
 * optimistically; an unfollow offers "undo", which re-follows through the same
 * optimistic path, and failures are reported with their reason.
 *
 * The target travels in the mutation variables rather than the render closure:
 * the route component is reused across profiles, so an undo clicked after
 * navigating to another profile must still act on the original one.
 */
export function useProfileFollow({
  githubUsername,
  username,
  userId,
}: {
  githubUsername: string
  /** The route's username param, which keys the profile query. */
  username: string
  userId: Id<'users'>
}) {
  const queryClient = useQueryClient()
  const followUser = useFollowUser()
  const unfollowUser = useUnfollowUser()

  const mutation = useMutation({
    mutationFn: async ({
      currentlyFollowed,
      userId: targetUserId,
    }: ProfileFollowVariables) =>
      currentlyFollowed
        ? unfollowUser({ targetUserId })
        : followUser({ targetUserId }),
    onMutate: async ({ currentlyFollowed, username: targetUsername }) => {
      const queryKey = profileQueryKeyFor(targetUsername)
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<PublicProfileOverview | null>(
        queryKey,
      )

      queryClient.setQueryData<PublicProfileOverview | null>(
        queryKey,
        (current) => {
          if (!current) {
            return current
          }

          const nextFollowed = !currentlyFollowed
          const delta = nextFollowed ? 1 : -1

          return {
            ...current,
            stats: {
              ...current.stats,
              followersCount: Math.max(0, current.stats.followersCount + delta),
            },
            viewerFollowsProfile: nextFollowed,
          }
        },
      )

      return { previous }
    },
    onError: (_error, variables, context) => {
      queryClient.setQueryData(
        profileQueryKeyFor(variables.username),
        context?.previous ?? null,
      )
    },
    onSettled: async (_data, _error, variables) => {
      await queryClient.invalidateQueries({
        queryKey: profileQueryKeyFor(variables.username),
      })
    },
  })

  const toggleFollow = async (currentlyFollowed: boolean): Promise<void> => {
    if (mutation.isPending) {
      return
    }

    const target = { username, userId }
    try {
      await mutation.mutateAsync({ ...target, currentlyFollowed })
    } catch (error) {
      reportActionError(error, {
        title: currentlyFollowed ? "couldn't unfollow" : "couldn't follow",
        retry: () => toggleFollow(currentlyFollowed),
      })
      return
    }

    if (currentlyFollowed) {
      showUndoToast({
        message: `unfollowed @${githubUsername}`,
        undo: () =>
          mutation.mutateAsync({ ...target, currentlyFollowed: false }),
      })
    }
  }

  return { isPending: mutation.isPending, toggleFollow }
}
