import { Link } from '@tanstack/react-router'
import type { Id } from '../../../convex/_generated/dataModel'
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
      <div className="flex flex-col gap-3">
        <div className="py-4.5 font-sans text-sm text-text-muted">
          liked projects are private on this profile.
        </div>
      </div>
    )
  }

  if (likedProjects.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="py-4.5 font-sans text-sm text-text-muted">
          no public likes yet.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {likedProjects.map((project) => {
        const owner = getProjectCardOwner(project.project)
        const repo = getProjectCardRepo(project.project)

        return (
          <Link
            key={String(project.reactionId)}
            to="/project/$owner/$repo"
            params={{ owner, repo }}
            preload="intent"
            className="rounded-[6px] border border-line bg-surface px-4 py-3.5 text-left"
          >
            <div className="mb-1 font-mono text-[13px] font-semibold text-text">
              {getProjectCardFullName(project.project)}
            </div>
            <div className="font-mono text-[11px] text-text-faint">
              liked {relativeTime(project.likedAt)}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
