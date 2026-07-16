import { ProjectCard } from '@/components/ui/project-card'
import { CardSheet } from '@/components/ui/card-sheet'
import { EmptyState } from '@/components/ui/empty-state'
import type { ProjectCardPreview } from '@/features/contracts'
import {
  getProjectCardId,
  getProjectCardOwner,
  getProjectCardRepo,
  toProjectCardData,
} from '@/features/project-card-preview'

export function PublicProfileProjectsList({
  projects,
}: {
  projects: ProjectCardPreview[]
}) {
  if (projects.length === 0) {
    return <EmptyState size="compact" title="no public projects yet." />
  }

  return (
    <CardSheet>
      {projects.map((project) => {
        const owner = getProjectCardOwner(project)
        const repo = getProjectCardRepo(project)

        return (
          <ProjectCard
            key={getProjectCardId(project)}
            project={toProjectCardData(project)}
            className="rounded-none border-0 focus-visible:ring-inset"
            authorLink={{
              username: project.authorHandle,
              search: { tab: 'projects' },
            }}
            projectLink={{ owner, repo }}
            showActions={false}
          />
        )
      })}
    </CardSheet>
  )
}
