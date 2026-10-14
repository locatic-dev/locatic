import Markdown, {
  defaultUrlTransform,
  type Components,
  type UrlTransform,
} from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '@/lib/utils'

// The one GitHub-flavored-markdown component map. `MarkdownProse` renders full
// documents (project READMEs, the privacy and terms pages); `MarkdownPreview`
// renders a flattened, image-free excerpt (release notes on the project page).
// Every renderer drops react-markdown's `node` prop so it never reaches the DOM.
const markdownProseComponents = {
  a({ className, href, children, node: _node, ...props }) {
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
  blockquote({ className, node: _node, ...props }) {
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
  code({ className, node: _node, ...props }) {
    return (
      <code
        {...props}
        className={cn(
          'rounded bg-canvas px-1.5 py-0.5 font-mono text-label text-text',
          className,
        )}
      />
    )
  },
  img({ alt, className, node: _node, ...props }) {
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
  input({ className, node: _node, ...props }) {
    return (
      <input
        {...props}
        disabled
        className={cn('mr-2 align-middle accent-brand', className)}
      />
    )
  },
  li({ className, node: _node, ...props }) {
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
  p({ className, node: _node, ...props }) {
    return (
      <p
        {...props}
        className={cn(
          'my-3 font-sans text-sm leading-[1.7] text-text-muted wrap-anywhere',
          className,
        )}
      />
    )
  },
  pre({ className, node: _node, ...props }) {
    return (
      <pre
        {...props}
        className={cn(
          'my-4 overflow-x-auto rounded-card bg-canvas px-4 py-3 font-mono text-label leading-[1.65] text-text',
          className,
        )}
      />
    )
  },
  table({ className, node: _node, ...props }) {
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
  td({ className, node: _node, ...props }) {
    return (
      <td
        {...props}
        className={cn('border border-line px-3 py-2 align-top', className)}
      />
    )
  },
  th({ className, node: _node, ...props }) {
    return (
      <th
        {...props}
        className={cn(
          'border border-line bg-surface-alt px-3 py-2 text-left font-mono text-label font-semibold text-text',
          className,
        )}
      />
    )
  },
  ol({ className, node: _node, ...props }) {
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
  ul({ className, node: _node, ...props }) {
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

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

const headingTags: HeadingTag[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']

// Styles follow the markdown source level, so a demoted README `#` still
// reads as the document's title.
const markdownHeadingClassNames: Partial<Record<HeadingTag, string>> = {
  h1: 'mt-0 mb-4 font-mono text-[22px] font-bold text-text wrap-anywhere',
  h2: 'mt-7 mb-3 border-b border-line pb-2 font-mono text-base font-semibold text-text wrap-anywhere',
  h3: 'mt-5 mb-2 font-mono text-sm font-semibold text-text-muted wrap-anywhere',
}

type HastNode = { type: string; value?: string; children?: HastNode[] }

function hastText(node: HastNode | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return node.value ?? ''
  return (node.children ?? []).map(hastText).join('')
}

/**
 * Anchor id for a document heading: its text without the section number, so
 * "## 7. Cookies" links as `#cookies` and survives renumbering.
 */
export function markdownHeadingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/^\s*\d+[a-z]?\.\s*/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Heading renderers that shift every markdown heading down `offset` levels
 * (capped at h6), so a document embedded under a page's own h1 cannot add a
 * second h1. Undemoted (document) headings also get anchor ids; embedded
 * READMEs don't, so their ids cannot collide with the page's.
 */
function markdownHeadingComponents(offset: 0 | 1): Components {
  return Object.fromEntries(
    headingTags.map((source, index) => {
      const Rendered = headingTags[Math.min(index + offset, 5)]
      const MarkdownHeading: NonNullable<Components[HeadingTag]> = ({
        className,
        node,
        ...props
      }) => (
        <Rendered
          id={
            offset === 0
              ? markdownHeadingId(hastText(node as HastNode | undefined)) ||
                undefined
              : undefined
          }
          {...props}
          className={cn(markdownHeadingClassNames[source], className)}
        />
      )
      return [source, MarkdownHeading]
    }),
  )
}

const markdownDocumentComponents: Components = {
  ...markdownProseComponents,
  ...markdownHeadingComponents(0),
}

const markdownEmbeddedComponents: Components = {
  ...markdownProseComponents,
  ...markdownHeadingComponents(1),
}

const markdownPreviewComponents = {
  a({ className, children, node: _node, ...props }) {
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
  blockquote({ className, node: _node, ...props }) {
    return (
      <blockquote
        {...props}
        className={cn(
          'my-2 border-l border-line pl-3 font-sans text-body leading-6 text-text-muted',
          className,
        )}
      />
    )
  },
  code({ className, node: _node, ...props }) {
    return (
      <code
        {...props}
        className={cn(
          'rounded bg-canvas px-1 py-0.5 font-mono text-label text-text-muted',
          className,
        )}
      />
    )
  },
  h1({ className, node: _node, ...props }) {
    return (
      <p
        {...props}
        className={cn(
          'my-2 font-sans text-body leading-6 text-text',
          className,
        )}
      />
    )
  },
  h2({ className, node: _node, ...props }) {
    return (
      <p
        {...props}
        className={cn(
          'my-2 font-sans text-body leading-6 text-text',
          className,
        )}
      />
    )
  },
  h3({ className, node: _node, ...props }) {
    return (
      <p
        {...props}
        className={cn(
          'my-2 font-sans text-body leading-6 text-text',
          className,
        )}
      />
    )
  },
  li({ className, node: _node, ...props }) {
    return (
      <li
        {...props}
        className={cn('my-1 pl-1 font-sans text-body leading-6', className)}
      />
    )
  },
  p({ className, node: _node, ...props }) {
    return (
      <p
        {...props}
        className={cn(
          'my-2 font-sans text-body leading-6 text-text-muted wrap-anywhere',
          className,
        )}
      />
    )
  },
  ol({ className, node: _node, ...props }) {
    return (
      <ol
        {...props}
        className={cn(
          'my-2 list-decimal space-y-1 pl-5 font-sans text-body text-text-muted',
          className,
        )}
      />
    )
  },
  ul({ className, node: _node, ...props }) {
    return (
      <ul
        {...props}
        className={cn(
          'my-2 list-disc space-y-1 pl-5 font-sans text-body text-text-muted',
          className,
        )}
      />
    )
  },
} satisfies Components

type MarkdownProseProps = {
  children: string
  urlTransform?: UrlTransform
  /**
   * Render markdown headings one level lower (h1 as h2 … h5 as h6) so
   * embedded documents such as READMEs never add a second h1. Pass false for
   * a document written to sit directly under the page's h1 (legal pages).
   */
  demoteHeadings?: boolean
}

export function MarkdownProse({
  children,
  urlTransform,
  demoteHeadings = true,
}: MarkdownProseProps) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={
        demoteHeadings ? markdownEmbeddedComponents : markdownDocumentComponents
      }
      urlTransform={urlTransform}
    >
      {children}
    </Markdown>
  )
}

export function MarkdownPreview({ children }: { children: string }) {
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
      components={markdownPreviewComponents}
      urlTransform={(url, key) =>
        key === 'src' ? null : defaultUrlTransform(url)
      }
    >
      {children}
    </Markdown>
  )
}
