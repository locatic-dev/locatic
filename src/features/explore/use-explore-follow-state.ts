import { useQueries } from '@tanstack/react-query'
import type { Id } from '../../../convex/_generated/dataModel'
import type { ExploreFeedState } from '@/features/explore/feed-state'
import type { BuilderPreview } from '@/features/explore/types'
import { chunkSavedStateIds } from '@/features/explore/use-explore-saves'
import { followStateQueryOptions } from '@/integrations/convex/query-options'

/** Most ids `api.follows.getFollowState` accepts per call. */
export const FOLLOW_STATE_CHUNK_SIZE = 40

/**
 * The users the loaded Explore cards offer to follow: rail builders first
 * (a short, stable list), then project owners or builders from the feed in
 * load order, so loading more pages only appends ids. Excludes the viewer.
 */
export function getExploreFollowTargetIds({
  feedState,
  railBuilders,
  viewerId,
}: {
  feedState: ExploreFeedState
  railBuilders: Array<Pick<BuilderPreview, 'userId'>>
  viewerId: Id<'users'> | undefined
}): Array<Id<'users'>> {
  const ids: Array<Id<'users'>> = railBuilders.map((builder) => builder.userId)
  if ('items' in feedState) {
    if (feedState.mode === 'projects')
      for (const item of feedState.items) ids.push(item.ownerUserId)
    else if (feedState.mode === 'builders')
      for (const item of feedState.items) ids.push(item.userId)
  }
  return [...new Set(ids)].filter((id) => id !== viewerId)
}

/**
 * The followed users among `userIds`, read in chunks of at most 40 so the
 * cost tracks the cards on screen. Visitors get no queries at all. The
 * results are live Convex subscriptions, so a follow or unfollow updates them
 * without a refetch.
 */
export function useExploreFollowedUserIds(
  userIds: Array<Id<'users'>>,
  enabled: boolean,
): Set<string> {
  const results = useQueries({
    queries: chunkSavedStateIds(
      enabled ? userIds : [],
      FOLLOW_STATE_CHUNK_SIZE,
    ).map((ids) => followStateQueryOptions(ids)),
  })

  return new Set(
    results.flatMap((result) =>
      ((result.data as Array<Id<'users'>> | undefined) ?? []).map(String),
    ),
  )
}
