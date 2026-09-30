import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  className?: string
}

/**
 * The band above a feed page. Its content sits in the feed column
 * (`lx-page-width-feed`), so the title and actions line up with the body
 * below instead of the viewport edges.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'shrink-0 border-b border-line px-(--lx-gutter) py-4',
        className,
      )}
    >
      <div className="lx-page-width-feed flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {subtitle && (
            <div className="mb-1.5 text-meta lowercase text-text-muted">
              {subtitle}
            </div>
          )}
          <h1 className="m-0 text-headline text-text">{title}</h1>
        </div>
        {/* Buttons size their own touch targets (`size="touch"`). */}
        {actions && (
          <div className="lx-stack-actions sm:justify-end">{actions}</div>
        )}
      </div>
    </header>
  )
}
