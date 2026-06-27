import Markdown, {
  defaultUrlTransform,
  type Components,
  type UrlTransform,
} from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '@/lib/utils'

export const projectMarkdownComponents = {
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

const projectMarkdownPreviewComponents = {
  a({ className, children, ...props }) {
    return (
      <span
        {...props}
        className={cn(
          'text-text underline decoration-line underline-offset-3',
          className,
        )}
      >
        {children}
      </span>
    )
  },
  blockquote({ className, ...props }) {
    return (
      <blockquote
        {...props}
        className={cn(
          'my-2 border-l border-line pl-3 font-sans text-[13px] leading-6 text-text-muted',
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
          'rounded bg-canvas px-1 py-0.5 font-mono text-[11.5px] text-text-muted',
          className,
        )}
      />
    )
  },
  h1({ className, ...props }) {
    return (
      <p
        {...props}
        className={cn(
          'my-2 font-sans text-[13px] leading-6 text-text',
          className,
        )}
      />
    )
  },
  h2({ className, ...props }) {
    return (
      <p
        {...props}
        className={cn(
          'my-2 font-sans text-[13px] leading-6 text-text',
          className,
        )}
      />
    )
  },
  h3({ className, ...props }) {
    return (
      <p
        {...props}
        className={cn(
          'my-2 font-sans text-[13px] leading-6 text-text',
          className,
        )}
      />
    )
  },
  li({ className, ...props }) {
    return (
      <li
        {...props}
        className={cn('my-1 pl-1 font-sans text-[13px] leading-6', className)}
      />
    )
  },
  p({ className, ...props }) {
    return (
      <p
        {...props}
        className={cn(
          'my-2 font-sans text-[13px] leading-6 text-text-muted wrap-anywhere',
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
          'my-2 list-decimal space-y-1 pl-5 font-sans text-[13px] text-text-muted',
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
          'my-2 list-disc space-y-1 pl-5 font-sans text-[13px] text-text-muted',
          className,
        )}
      />
    )
  },
} satisfies Components

export function ProjectMarkdownProse({
  children,
  urlTransform,
}: {
  children: string
  urlTransform?: UrlTransform
}) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={projectMarkdownComponents}
      urlTransform={urlTransform}
    >
      {children}
    </Markdown>
  )
}

export function ProjectMarkdownPreview({ children }: { children: string }) {
  return (
    <Markdown
      skipHtml
      remarkPlugins={[remarkGfm]}
      allowedElements={[
        'a',
        'blockquote',
        'br',
        'code',
        'em',
        'h1',
        'h2',
        'h3',
        'li',
        'ol',
        'p',
        'strong',
        'ul',
      ]}
      components={projectMarkdownPreviewComponents}
      urlTransform={(url, key) =>
        key === 'src' ? null : defaultUrlTransform(url)
      }
    >
      {children}
    </Markdown>
  )
}
