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
      className={className}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        textAlign: 'center',
      }}
    >
      {icon && (
        <div
          style={{
            marginBottom: 20,
            color: 'var(--lx-text-3)',
          }}
        >
          {icon}
        </div>
      )}
      <div
        style={{
          fontFamily: 'var(--lx-font-mono)',
          fontSize: 11,
          color: 'var(--lx-text-3)',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 14,
            background: 'var(--lx-accent)',
          }}
          aria-hidden
        />
        <span>~/empty</span>
      </div>
      <h2
        style={{
          margin: 0,
          fontFamily: 'var(--lx-font-mono)',
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: 'var(--lx-text)',
          maxWidth: 400,
          lineHeight: 1.3,
        }}
      >
        {title}
      </h2>
      {description && (
        <p
          style={{
            margin: '12px 0 0',
            maxWidth: 360,
            fontFamily: 'var(--lx-font-sans)',
            fontSize: 14,
            color: 'var(--lx-text-2)',
            lineHeight: 1.6,
          }}
        >
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          {action && (
            <Button
              onClick={action.onClick}
              style={{
                background: 'var(--lx-accent)',
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
