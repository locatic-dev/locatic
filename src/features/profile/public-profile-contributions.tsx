import { EmptyState } from '@/components/ui/empty-state'
import { ProjectCard } from '@/components/ui/project-card'
import type { ContributedProjectPreview } from '@/features/contracts'
import {
  getProjectCardDbId,
  getProjectCardId,
  getProjectCardOwner,
  getProjectCardRepo,
  toProjectCardData,
} from '@/features/project-card-preview'
import { compactNumber } from '@/lib/format'
import { ProjectReactionBar } from '@/features/projects/reactions/project-reaction-bar'

export function PublicProfileContributionsList({
  contributions,
  visible,
}: {
  contributions: ContributedProjectPreview[]
  visible: boolean
}) {
  if (!visible) {
    return (
      <EmptyState
        size="compact"
        headingLevel={3}
        title="contributions are private on this profile."
      />
    )
  }

  if (contributions.length === 0) {
    return (
      <EmptyState
        size="compact"
        headingLevel={3}
        title="no public contributions yet."
      />
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {contributions.map((entry) => {
        const owner = getProjectCardOwner(entry.project)
        const repo = getProjectCardRepo(entry.project)

        return (
          <div
            key={getProjectCardId(entry.project)}
            className="overflow-hidden rounded-card border border-line bg-surface"
          >
            <div className="border-b border-line-strong px-4 py-3 font-mono text-meta text-text-faint">
              contributor · {compactNumber(entry.commitCount)} commits matched
            </div>
            <ProjectCard
              project={toProjectCardData(entry.project)}
              authorLink={{
                username: entry.project.authorHandle,
                search: { tab: 'projects' },
              }}
              projectLink={{ owner, repo }}
              showActions={false}
              reactionSlot={
                <ProjectReactionBar
                  projectId={getProjectCardDbId(entry.project)}
                  reactionCounts={entry.project.reactionCounts}
                  viewerReactionTypes={entry.project.viewerReactionTypes}
                />
              }
              className="rounded-none border-0 focus-visible:ring-inset"
            />
          </div>
        )
      })}
    </div>
  )
}
