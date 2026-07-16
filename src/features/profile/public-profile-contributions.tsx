import { ContributionGraph } from '@/components/ui/contribution-graph'
import { EmptyState } from '@/components/ui/empty-state'
import { ProjectCard } from '@/components/ui/project-card'
import type { ContributedProjectPreview } from '@/features/contracts'
import {
  getProjectCardId,
  getProjectCardOwner,
  getProjectCardRepo,
  toProjectCardData,
} from '@/features/project-card-preview'
import { compactNumber } from '@/lib/format'
import { ProjectReactionBar } from '@/features/projects/reactions/project-reaction-bar'

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
      <EmptyState
        size="compact"
        title="contributions are private on this profile."
      />
    )
  }

  if (contributions.length === 0) {
    return <EmptyState size="compact" title="no public contributions yet." />
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
            <div className="border-b border-line-strong px-4 py-3 font-mono text-[11px] text-text-faint">
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
                  projectId={getProjectCardId(entry.project)}
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
