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
      title={city}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 8px',
        borderRadius: 3,
        border: '1px solid var(--lx-border)',
        background: 'var(--lx-surface-alt)',
        fontFamily: 'var(--lx-font-mono)',
        fontSize: 11,
        color: 'var(--lx-text-2)',
        lineHeight: 1,
        maxWidth: '100%',
        minHeight: 28,
        overflow: 'hidden',
      }}
    >
      <MapPin size={10} style={{ color: 'var(--lx-text-3)', flexShrink: 0 }} />
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {city}
      </span>
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${city}`}
          style={{
            background: 'none',
            border: 'none',
            padding: 2,
            marginLeft: 2,
            color: 'var(--lx-text-3)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            minWidth: 20,
            minHeight: 20,
            justifyContent: 'center',
          }}
        >
          <X size={9} strokeWidth={2} />
        </button>
      )}
    </span>
  )
}
