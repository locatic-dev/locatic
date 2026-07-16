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
  projectId: string
  reactionCounts?: Record<string, number>
  viewerReactionTypes?: string[]
}) {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const queriedViewerReactionTypes = useQuery(
    api.projects.getViewerReactionTypes,
    { projectId: projectId as Id<'projects'> },
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
        (viewerReactionTypes === undefined &&
          queriedViewerReactionTypes === undefined)
      }
      reactionCounts={reactionCounts ?? {}}
      targetId={projectId}
      targetType="project"
      viewerReactionTypes={[...effectiveViewerReactionTypes]}
    />
  )
}
