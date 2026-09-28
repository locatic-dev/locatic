import type { ReactNode } from 'react'
import { Button } from './button'

interface EmptyStateProps {
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  secondaryAction?: {
    label: string
    onClick: () => void
  }
  icon?: ReactNode
  /** `compact` for tab panels / asides: tighter padding, smaller heading, no decorative row. */
  size?: 'default' | 'compact'
  /** Level of the title heading; use 3 or 4 inside a section that has its own h2. */
  headingLevel?: 2 | 3 | 4
  className?: string
}

export function EmptyState({
  title,
  description,
  action,
  secondaryAction,
  icon,
  size = 'default',
  headingLevel = 2,
  className,
}: EmptyStateProps) {
  const compact = size === 'compact'
  const Heading = `h${headingLevel}` as const

  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center text-center ${
        compact ? 'p-6' : 'p-8'
      } ${className ?? ''}`}
    >
      {icon && (
        <div className={`text-text-faint ${compact ? 'mb-3' : 'mb-5'}`}>
          {icon}
        </div>
      )}
      {!compact && (
        <div className="mb-5 flex items-center gap-2 font-mono text-meta text-text-faint">
          <span className="inline-block h-3.5 w-2 bg-brand" aria-hidden />
          <span>~/empty</span>
        </div>
      )}
      <Heading
        className={`m-0 max-w-100 font-mono font-semibold tracking-[-0.02em] text-text ${
          compact ? 'text-title' : 'text-headline'
        }`}
      >
        {title}
      </Heading>
      {description && (
        <p
          className={`max-w-90 font-sans leading-6 text-text-muted ${
            compact ? 'mt-2 text-body' : 'mt-3 text-sm'
          }`}
        >
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div
          className={`flex w-full flex-col gap-3 sm:w-auto sm:flex-row ${
            compact ? 'mt-4' : 'mt-6'
          }`}
        >
          {action && (
            <Button onClick={action.onClick} variant="primary" size="meta">
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button onClick={secondaryAction.onClick} size="meta">
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
