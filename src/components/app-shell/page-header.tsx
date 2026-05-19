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
          <div className="mb-1.5 font-mono text-[11px] lowercase text-text-faint">
            {subtitle}
          </div>
        )}
        <h1
          className={cn(
            'm-0 font-mono font-semibold tracking-[-0.02em] text-text',
            subtitle ? 'text-[22px]' : 'text-sm',
          )}
        >
          {title}
        </h1>
      </div>
      {actions && (
        <div className="lx-stack-actions sm:justify-end">{actions}</div>
      )}
    </header>
  )
}
