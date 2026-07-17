import type { ReactNode } from 'react'

import { LxAvatar } from '@/components/ui/lx-avatar'
import { relativeTime } from '@/lib/time'
import { cn } from '@/lib/utils'

export function ProfileActivityCard({
  authorAvatarUrl,
  authorName,
  body,
  context,
  createdAt,
  disabled = false,
  footer,
  onOpen,
  topics = [],
}: {
  authorAvatarUrl?: string | null
  authorName: string
  body: string
  context: string
  createdAt: number
  disabled?: boolean
  footer: ReactNode
  onOpen: () => void
  topics?: string[]
}) {
  return (
    <article
      className={cn(
        'lx-card overflow-visible rounded-card border border-line bg-surface transition-transform duration-[140ms] ease-out',
        !disabled && 'active:scale-[0.997]',
        disabled && 'opacity-70',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className="block w-full rounded-t-card border-0 bg-transparent px-5 pt-4 pb-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset enabled:hover:bg-surface-alt"
      >
        <div className="mb-3 flex min-w-0 items-center gap-2.5">
          <LxAvatar name={authorName} avatarUrl={authorAvatarUrl} size={34} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-[13px] font-semibold text-text">
              {authorName}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 font-mono text-[11px] text-text-faint">
              <span className="min-w-0 truncate text-text-muted">
                {context}
              </span>
              <span aria-hidden="true">·</span>
              <span className="shrink-0">{relativeTime(createdAt)}</span>
            </div>
          </div>
        </div>

        <p className="m-0 line-clamp-3 font-sans text-[14px] leading-6 text-text wrap-anywhere">
          {body}
        </p>

        {topics.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {topics.slice(0, 4).map((topic) => (
              <span
                key={topic}
                className="rounded-control border border-line px-2 py-0.5 font-mono text-[10.5px] text-text-muted"
              >
                #{topic}
              </span>
            ))}
          </div>
        )}
      </button>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-1">
        {footer}
      </div>
    </article>
  )
}
