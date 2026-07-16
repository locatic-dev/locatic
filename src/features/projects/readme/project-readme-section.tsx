import { MarkdownProse } from '@/components/ui/markdown-prose'
import {
  resolveGithubReadmeMarkdownUrl,
  type GithubReadmeUrlBases,
} from '@/lib/github-readme-url'

type ProjectReadmeSectionProps = {
  bases: GithubReadmeUrlBases
  readmePreview: string
}

export function ProjectReadmeSection({
  bases,
  readmePreview,
}: ProjectReadmeSectionProps) {
  if (!readmePreview.trim()) return null

  const readmeUrlTransform = (url: string, key: string) =>
    resolveGithubReadmeMarkdownUrl({
      bases,
      kind: key === 'src' ? 'asset' : 'link',
      url,
    })

  return (
    <div className="overflow-hidden rounded-[6px] border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line bg-surface-alt px-4 py-2.5 font-mono text-[11.5px]">
        <span className="text-text-muted">README.md</span>
        <span className="text-text-faint">repo overview</span>
      </div>
      <div className="px-5 py-5 md:px-7 md:py-6">
        <MarkdownProse urlTransform={readmeUrlTransform}>
          {readmePreview}
        </MarkdownProse>
      </div>
    </div>
  )
}
