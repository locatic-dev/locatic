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
      <h2 className="m-0 max-w-[400px] font-mono text-[22px] font-semibold leading-[1.3] tracking-[-0.02em] text-text">
        {title}
      </h2>
      {description && (
        <p className="mt-3 max-w-[360px] font-sans text-sm leading-6 text-text-muted">
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div
          className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row"
          style={{ marginTop: 24 }}
        >
          {action && (
            <Button
              onClick={action.onClick}
              className="min-h-11 w-full sm:w-auto"
              style={{
                background: 'var(--color-brand)',
                color: '#0d1117',
                border: 'none',
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant="outline"
              onClick={secondaryAction.onClick}
              className="min-h-11 w-full sm:w-auto"
              style={{
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 12.5,
              }}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
