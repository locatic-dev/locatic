import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import {
  resolveGithubReadmeMarkdownUrl,
  type GithubReadmeUrlBases,
} from '@/lib/github-readme-url'
import { cn } from '@/lib/utils'

const readmeMarkdownComponents = {
  a({ className, href, children, ...props }) {
    const isExternal = typeof href === 'string' && /^(https?:)?\/\//.test(href)

    return (
      <a
        {...props}
        href={href}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noreferrer noopener' : undefined}
        className={cn(
          'text-brand underline decoration-brand/40 underline-offset-3 transition-colors hover:decoration-brand',
          className,
        )}
      >
        {children}
      </a>
    )
  },
  blockquote({ className, ...props }) {
    return (
      <blockquote
        {...props}
        className={cn(
          'my-4 border-l border-line pl-4 font-sans text-sm leading-[1.65] text-text-muted',
          className,
        )}
      />
    )
  },
  code({ className, ...props }) {
    return (
      <code
        {...props}
        className={cn(
          'rounded bg-canvas px-1.5 py-0.5 font-mono text-[12px] text-text',
          className,
        )}
      />
    )
  },
  h1({ className, ...props }) {
    return (
      <h1
        {...props}
        className={cn(
          'mt-0 mb-4 font-mono text-[22px] font-bold text-text wrap-anywhere',
          className,
        )}
      />
    )
  },
  h2({ className, ...props }) {
    return (
      <h2
        {...props}
        className={cn(
          'mt-7 mb-3 border-b border-line pb-2 font-mono text-base font-semibold text-text wrap-anywhere',
          className,
        )}
      />
    )
  },
  h3({ className, ...props }) {
    return (
      <h3
        {...props}
        className={cn(
          'mt-5 mb-2 font-mono text-sm font-semibold text-text-muted wrap-anywhere',
          className,
        )}
      />
    )
  },
  img({ alt, className, ...props }) {
    return (
      <img
        {...props}
        alt={alt ?? ''}
        loading="lazy"
        className={cn(
          'my-4 block max-w-full rounded-card border border-line bg-canvas object-contain',
          className,
        )}
      />
    )
  },
  input({ className, ...props }) {
    return (
      <input
        {...props}
        disabled
        className={cn('mr-2 align-middle accent-brand', className)}
      />
    )
  },
  li({ className, ...props }) {
    return (
      <li
        {...props}
        className={cn(
          'my-1.5 pl-1 font-sans text-sm leading-[1.65]',
          className,
        )}
      />
    )
  },
  p({ className, ...props }) {
    return (
      <p
        {...props}
        className={cn(
          'my-3 font-sans text-sm leading-[1.7] text-text wrap-anywhere',
          className,
        )}
      />
    )
  },
  pre({ className, ...props }) {
    return (
      <pre
        {...props}
        className={cn(
          'my-4 overflow-x-auto rounded-card bg-canvas px-4 py-3 font-mono text-[12px] leading-[1.65] text-text',
          className,
        )}
      />
    )
  },
  table({ className, ...props }) {
    return (
      <div className="my-4 overflow-x-auto">
        <table
          {...props}
          className={cn(
            'min-w-full border-collapse font-sans text-sm text-text-muted',
            className,
          )}
        />
      </div>
    )
  },
  td({ className, ...props }) {
    return (
      <td
        {...props}
        className={cn('border border-line px-3 py-2 align-top', className)}
      />
    )
  },
  th({ className, ...props }) {
    return (
      <th
        {...props}
        className={cn(
          'border border-line bg-surface-alt px-3 py-2 text-left font-mono text-[12px] font-semibold text-text',
          className,
        )}
      />
    )
  },
  ol({ className, ...props }) {
    return (
      <ol
        {...props}
        className={cn(
          'my-3 list-decimal space-y-1 pl-6 font-sans text-sm text-text-muted',
          className,
        )}
      />
    )
  },
  ul({ className, ...props }) {
    return (
      <ul
        {...props}
        className={cn(
          'my-3 list-disc space-y-1 pl-6 font-sans text-sm text-text-muted',
          className,
        )}
      />
    )
  },
} satisfies Components

type ProjectReadmeSectionProps = {
  bases: GithubReadmeUrlBases
  readmePreview: string
}

export function ProjectReadmeSection({
  bases,
  readmePreview,
}: ProjectReadmeSectionProps) {
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
        {readmePreview ? (
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={readmeMarkdownComponents}
            urlTransform={readmeUrlTransform}
          >
            {readmePreview}
          </Markdown>
        ) : (
          <p className="m-0 font-sans text-sm leading-[1.65] text-text-muted">
            README not available on GitHub.
          </p>
        )}
      </div>
    </div>
  )
}
