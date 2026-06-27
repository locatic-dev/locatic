import { ProjectCard } from '@/components/ui/project-card'
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
    return (
      <div className="py-4.5 font-sans text-sm text-text-muted">
        no public projects yet.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3.5">
      {projects.map((project) => {
        const owner = getProjectCardOwner(project)
        const repo = getProjectCardRepo(project)

        return (
          <ProjectCard
            key={getProjectCardId(project)}
            project={toProjectCardData(project)}
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
