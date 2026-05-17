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
      className={`flex flex-col gap-3 border-b border-border px-[var(--lx-gutter)] py-4 sm:flex-row sm:items-center sm:justify-between ${className ?? ''}`}
      style={{
        flexShrink: 0,
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
        <div className="lx-stack-actions sm:justify-end">{actions}</div>
      )}
    </header>
  )
}
