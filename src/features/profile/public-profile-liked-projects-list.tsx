import { Link } from '@tanstack/react-router'
import type { Id } from '../../../convex/_generated/dataModel'
import { CardSheet } from '@/components/ui/card-sheet'
import { EmptyState } from '@/components/ui/empty-state'
import type { ProjectCardPreview } from '@/features/contracts'
import {
  getProjectCardFullName,
  getProjectCardOwner,
  getProjectCardRepo,
} from '@/features/project-card-preview'
import { relativeTime } from '@/lib/time'

type PublicLikedProject = {
  reactionId: Id<'reactions'>
  projectId: Id<'projects'>
  likedAt: number
  project: ProjectCardPreview
}

export function PublicProfileLikedProjectsList({
  likedProjects,
  visible,
}: {
  likedProjects: PublicLikedProject[]
  visible: boolean
}) {
  if (!visible) {
    return (
      <EmptyState
        size="compact"
        headingLevel={3}
        title="liked projects are private on this profile."
      />
    )
  }

  if (likedProjects.length === 0) {
    return (
      <EmptyState
        size="compact"
        headingLevel={3}
        title="no public likes yet."
      />
    )
  }

  return (
    <CardSheet>
      {likedProjects.map((project) => {
        const owner = getProjectCardOwner(project.project)
        const repo = getProjectCardRepo(project.project)

        return (
          <Link
            key={String(project.reactionId)}
            to="/project/$owner/$repo"
            params={{ owner, repo }}
            preload="intent"
            className="block bg-surface px-5 py-4 text-left no-underline transition-colors hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
          >
            <div className="mb-1 text-title text-text">
              {getProjectCardFullName(project.project)}
            </div>
            <div className="font-mono text-meta text-text-muted">
              liked {relativeTime(project.likedAt)}
            </div>
          </Link>
        )
      })}
    </CardSheet>
  )
}
