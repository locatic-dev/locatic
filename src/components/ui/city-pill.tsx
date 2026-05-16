import { MapPin, X } from '@/lib/icons'

interface CityPillProps {
  city: string
  onRemove?: () => void
  className?: string
}

export function CityPill({ city, onRemove, className }: CityPillProps) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        borderRadius: 3,
        border: '1px solid var(--lx-border)',
        background: 'var(--lx-surface-alt)',
        fontFamily: 'var(--lx-font-mono)',
        fontSize: 11,
        color: 'var(--lx-text-2)',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      <MapPin size={10} style={{ color: 'var(--lx-text-3)', flexShrink: 0 }} />
      {city}
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${city}`}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            marginLeft: 2,
            color: 'var(--lx-text-3)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <X size={9} strokeWidth={2} />
        </button>
      )}
    </span>
  )
}
