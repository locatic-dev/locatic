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
      className={className}
      style={{
        padding: subtitle ? '20px 32px' : '0 32px',
        borderBottom: '1px solid var(--lx-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        ...(subtitle ? {} : { height: 56 }),
      }}
    >
      <div>
        {subtitle && (
          <div
            style={{
              fontFamily: 'var(--lx-font-mono)',
              fontSize: 11,
              color: 'var(--lx-text-3)',
              marginBottom: 6,
              textTransform: 'lowercase',
            }}
          >
            {subtitle}
          </div>
        )}
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--lx-font-mono)',
            fontSize: subtitle ? 22 : 14,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: 'var(--lx-text)',
          }}
        >
          {title}
        </h1>
      </div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {actions}
        </div>
      )}
    </header>
  )
}
