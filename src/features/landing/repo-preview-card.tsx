import { Link } from '@tanstack/react-router'
import type { ProjectCardPreview } from '@/features/contracts'
import { relativeTime } from '@/lib/time'

/**
 * The hero's project column (plan item D7): real eligible public projects
 * from `api.projects.listLandingShowcase`, each linking to its project page
 * and builder. With no eligible project yet it falls back to a labelled
 * example of what a card shows, with no counts, hidden on mobile.
 */
export function RepoPreviewCard({
  projects,
}: {
  projects: ReadonlyArray<ProjectCardPreview>
}) {
  if (projects.length === 0) {
    return <ExampleRepoPreviewCard />
  }

  return (
    <figure className="lx-hero-up relative m-0 [--hero-step:3]">
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {projects.map((project) => (
          <li
            key={project.projectId}
            className="rounded-card border border-line bg-surface px-5 py-4 shadow-card"
          >
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <Link
                to="/project/$owner/$repo"
                params={{ owner: project.owner, repo: project.repo }}
                className="min-w-0 truncate font-mono text-title font-semibold text-text no-underline hover:underline"
              >
                <span className="font-normal text-text-muted">
                  {project.owner}/
                </span>
                {project.repo}
              </Link>
              <span className="shrink-0 font-mono text-label text-text-muted">
                updated{' '}
                {relativeTime(project.latestUpdate?.at ?? project.lastCommitAt)}
              </span>
            </div>
            {project.description && (
              <p className="mt-0 mb-2 line-clamp-2 font-sans text-body leading-normal text-text-muted">
                {project.description}
              </p>
            )}
            <div className="font-mono text-label text-text-muted">
              <Link
                to="/u/$username"
                params={{ username: project.authorHandle }}
                search={{ tab: 'projects' }}
                className="text-text-muted no-underline hover:text-text hover:underline"
              >
                @{project.authorHandle}
              </Link>
              {project.cityLabel && <span> · {project.cityLabel}</span>}
            </div>
          </li>
        ))}
      </ul>
      <figcaption className="mt-3 font-mono text-label text-text-muted">
        recently updated public projects on locatic
      </figcaption>
    </figure>
  )
}

/** Illustration of a project card, shown until real projects exist. */
function ExampleRepoPreviewCard() {
  return (
    <figure className="lx-hero-up relative m-0 hidden md:block [--hero-step:3]">
      <div className="rounded-card border border-line bg-surface px-5 py-4.5 shadow-card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="rounded-control border border-line-strong px-1.5 py-0.5 font-mono text-meta text-text-muted">
            example
          </span>
          <span className="font-mono text-label text-text-muted">
            updated today
          </span>
        </div>
        <div className="mb-1.5 font-mono text-title font-semibold text-text">
          <span className="font-normal text-text-muted">you/</span>
          your-side-project
        </div>
        <p className="mt-0 mb-3 font-sans text-body leading-normal text-text-muted">
          the public repo you are building right now, with a short note on what
          it does.
        </p>
        <div className="font-mono text-label text-text-muted">
          @you · your city
        </div>
      </div>
      <figcaption className="mt-3 font-mono text-label text-text-muted">
        how your project appears to builders nearby
      </figcaption>
    </figure>
  )
}
