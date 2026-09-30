import type { ReactNode } from 'react'
import { ProjectCard } from '@/components/ui/project-card'
import { EmptyState } from '@/components/ui/empty-state'
import { cardSheetClass } from '@/components/ui/card-sheet'
import type { ProjectCardPreview } from '@/features/contracts'
import {
  getProjectCardDbId,
  getProjectCardId,
  getProjectCardOwner,
  getProjectCardRepo,
  toProjectCardData,
} from '@/features/project-card-preview'
import { ProjectReactionBar } from '@/features/projects/reactions/project-reaction-bar'
import type { useRefreshProjectSync } from '@/features/projects/use-refresh-project-sync'

/** The owner's GitHub re-sync, from `useRefreshProjectSync`. */
export type ProfileProjectRetrySync = ReturnType<typeof useRefreshProjectSync>

export function PublicProfileProjectsList<TProject extends ProjectCardPreview>({
  projects,
  renderTopLeftSlot,
  retrySync,
}: {
  projects: TProject[]
  /** Per-card control in the card's top-left slot, e.g. the owner's pin toggle. */
  renderTopLeftSlot?: (project: TProject) => ReactNode
  /** Owner only: a retry on cards whose last GitHub refresh failed. */
  retrySync?: ProfileProjectRetrySync
}) {
  if (projects.length === 0) {
    return (
      <EmptyState
        size="compact"
        headingLevel={3}
        title="no public projects yet."
      />
    )
  }

  return (
    <div className={cardSheetClass}>
      {projects.map((project) => {
        const owner = getProjectCardOwner(project)
        const repo = getProjectCardRepo(project)

        return (
          <ProjectCard
            key={getProjectCardId(project)}
            variant="row"
            // Every card on a profile has the same author.
            authorPlacement="none"
            project={toProjectCardData(project)}
            topLeftSlot={renderTopLeftSlot?.(project)}
            onRetrySync={
              retrySync
                ? () => void retrySync.refresh(getProjectCardDbId(project))
                : undefined
            }
            retrySyncPending={
              retrySync?.pendingProjectId === getProjectCardId(project)
            }
            reactionSlot={
              <ProjectReactionBar
                projectId={getProjectCardDbId(project)}
                reactionCounts={project.reactionCounts}
                viewerReactionTypes={project.viewerReactionTypes}
              />
            }
            className="focus-visible:ring-inset"
            authorLink={{
              username: project.authorHandle,
              search: { tab: 'projects' },
            }}
            projectLink={{ owner, repo }}
            showActions={false}
          />
        )
      })}
    </div>
  )
}
