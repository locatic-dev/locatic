import type { ProjectDetailPayload } from '@/features/contracts'
import { Card } from '@/components/ui/card'
import { MarkdownPreview } from '@/components/ui/markdown-prose'
import { relativeTime } from '@/lib/time'

type ProjectRelease = ProjectDetailPayload['releases'][number]

function getReleaseBodyPreview(body: string) {
  const trimmed = body.trim()
  if (trimmed.length <= 700) {
    return trimmed
  }

  return `${trimmed.slice(0, 700).trimEnd()}…`
}

function ProjectReleaseCard({ release }: { release: ProjectRelease }) {
  const title = release.name || release.tagName

  return (
    <article className="group relative border-b border-line px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-alt sm:px-5">
      <a
        href={release.htmlUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${title} release on GitHub`}
        className="absolute inset-0 z-0 rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      />
      <div className="pointer-events-none relative z-10">
        <div className="mb-1 flex flex-wrap items-center gap-2 font-mono text-xs font-semibold text-text">
          <span className="transition-colors group-hover:text-brand">
            {title}
          </span>
          {release.isPrerelease ? (
            <span className="rounded border border-line bg-surface-raised px-1.5 py-0.5 text-meta text-text-muted">
              pre-release
            </span>
          ) : null}
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-meta text-text-faint">
          <span>{release.tagName}</span>
          {release.publishedAt ? (
            <span>{relativeTime(release.publishedAt)}</span>
          ) : null}
          <span className="text-text-muted">view on GitHub</span>
        </div>
        {release.body ? (
          <div className="max-h-32 overflow-hidden font-sans text-body leading-6 text-text-muted">
            <MarkdownPreview>
              {getReleaseBodyPreview(release.body)}
            </MarkdownPreview>
          </div>
        ) : (
          <p className="m-0 font-sans text-body text-text-muted">
            no release notes.
          </p>
        )}
      </div>
    </article>
  )
}

export function ProjectReleasesSection({
  releases,
}: {
  releases: ProjectRelease[]
}) {
  return (
    <Card density="flush" className="overflow-hidden">
      {releases.length === 0 ? (
        <div className="p-4.5 font-sans text-body text-text-muted">
          no GitHub releases imported yet.
        </div>
      ) : (
        releases.map((release) => (
          <ProjectReleaseCard key={String(release._id)} release={release} />
        ))
      )}
    </Card>
  )
}
