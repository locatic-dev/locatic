import { ContributionGraph } from '@/components/ui/contribution-graph'
import { ProjectCard } from '@/components/ui/project-card'
import type { ContributedProjectPreview } from '@/features/contracts'
import {
  getProjectCardId,
  getProjectCardOwner,
  getProjectCardRepo,
  toProjectCardData,
} from '@/features/project-card-preview'
import { compactNumber } from '@/lib/format'

type GithubContributions = {
  totalContributions: number
  weeks: Array<{
    days: Array<{
      count: number
      date: string
    }>
  }>
} | null

export function PublicProfileContributionGraph({
  githubContributions,
}: {
  githubContributions: GithubContributions
}) {
  return (
    <div className="mb-8">
      <div className="mb-2.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-faint">
        {githubContributions?.totalContributions != null
          ? `${githubContributions.totalContributions.toLocaleString()} contributions this year`
          : 'contributions this year'}
      </div>
      <div className="overflow-x-auto">
        <ContributionGraph
          weeks={githubContributions?.weeks ?? undefined}
          totalContributions={
            githubContributions?.totalContributions ?? undefined
          }
          unavailable={
            !githubContributions?.weeks ||
            githubContributions.weeks.length === 0
          }
        />
      </div>
    </div>
  )
}

export function PublicProfileContributionsList({
  contributions,
  visible,
}: {
  contributions: ContributedProjectPreview[]
  visible: boolean
}) {
  if (!visible) {
    return (
      <div className="py-4.5 font-sans text-sm text-text-muted">
        contributions are private on this profile.
      </div>
    )
  }

  if (contributions.length === 0) {
    return (
      <div className="py-4.5 font-sans text-sm text-text-muted">
        no public contributions yet.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3.5">
      {contributions.map((entry) => {
        const owner = getProjectCardOwner(entry.project)
        const repo = getProjectCardRepo(entry.project)

        return (
          <div
            key={getProjectCardId(entry.project)}
            className="rounded-card border border-line bg-transparent"
          >
            <div className="border-b border-line px-4 py-3 font-mono text-[11px] text-text-faint">
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
              className="rounded-none border-0"
            />
          </div>
        )
      })}
    </div>
  )
}
