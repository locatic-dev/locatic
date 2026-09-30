import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  className?: string
}

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
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div>
        {subtitle && (
          <div className="mb-1.5 text-meta lowercase text-text-muted">
            {subtitle}
          </div>
        )}
        <h1 className="m-0 text-headline text-text">{title}</h1>
      </div>
      {actions && (
        // Actions are touch targets on phones whatever size the caller picked.
        <div className="lx-stack-actions max-md:*:min-h-11 max-md:*:min-w-11 sm:justify-end">
          {actions}
        </div>
      )}
    </header>
  )
}
