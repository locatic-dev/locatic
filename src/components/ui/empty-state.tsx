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
  className?: string
}

export function EmptyState({
  title,
  description,
  action,
  secondaryAction,
  icon,
  size = 'default',
  className,
}: EmptyStateProps) {
  const compact = size === 'compact'

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
        <div className="mb-5 flex items-center gap-2 font-mono text-[11px] text-text-faint">
          <span className="inline-block h-3.5 w-2 bg-brand" aria-hidden />
          <span>~/empty</span>
        </div>
      )}
      <h2
        className={`m-0 max-w-100 font-mono font-semibold tracking-[-0.02em] text-text ${
          compact ? 'text-[15px] leading-[1.4]' : 'text-[22px] leading-[1.3]'
        }`}
      >
        {title}
      </h2>
      {description && (
        <p
          className={`max-w-90 font-sans leading-6 text-text-muted ${
            compact ? 'mt-2 text-[13px]' : 'mt-3 text-sm'
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
            <Button
              onClick={action.onClick}
              variant="brand"
              size="meta"
              className="w-full font-mono sm:w-auto"
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant="outline"
              onClick={secondaryAction.onClick}
              size="meta"
              className="w-full font-mono sm:w-auto"
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
