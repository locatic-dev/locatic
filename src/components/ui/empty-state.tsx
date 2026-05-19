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
  className?: string
}

export function EmptyState({
  title,
  description,
  action,
  secondaryAction,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center p-8 text-center ${className ?? ''}`}
    >
      {icon && <div className="mb-5 text-text-faint">{icon}</div>}
      <div className="mb-5 flex items-center gap-2 font-mono text-[11px] text-text-faint">
        <span className="inline-block h-3.5 w-2 bg-brand" aria-hidden />
        <span>~/empty</span>
      </div>
      <h2 className="m-0 max-w-100 font-mono text-[22px] font-semibold leading-[1.3] tracking-[-0.02em] text-text">
        {title}
      </h2>
      {description && (
        <p className="mt-3 max-w-90 font-sans text-sm leading-6 text-text-muted">
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-6 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
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
