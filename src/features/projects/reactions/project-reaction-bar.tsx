import { useConvexAuth, useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { ReactionBar } from './reaction-bar'

export function ProjectReactionBar({
  disabled = false,
  liked,
  projectId,
  reactionCounts,
  viewerReactionTypes,
}: {
  disabled?: boolean
  liked?: boolean
  projectId: Id<'projects'>
  reactionCounts?: Record<string, number>
  viewerReactionTypes?: string[]
}) {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const shouldQueryViewerReactions =
    viewerReactionTypes === undefined && !isLoading && isAuthenticated
  const queriedViewerReactionTypes = useQuery(
    api.projects.getViewerReactionTypes,
    shouldQueryViewerReactions ? { projectId } : 'skip',
  )
  const effectiveViewerReactionTypes = new Set(
    viewerReactionTypes ?? queriedViewerReactionTypes ?? [],
  )
  if (liked) effectiveViewerReactionTypes.add('like')

  return (
    <ReactionBar
      disabled={
        disabled ||
        isLoading ||
        !isAuthenticated ||
        (shouldQueryViewerReactions && queriedViewerReactionTypes === undefined)
      }
      reactionCounts={reactionCounts ?? {}}
      targetId={String(projectId)}
      targetType="project"
      viewerReactionTypes={[...effectiveViewerReactionTypes]}
    />
  )
}
