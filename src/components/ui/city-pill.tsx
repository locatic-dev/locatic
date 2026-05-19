import { MapPin, X } from '@/lib/icons'
import { cn } from '@/lib/utils'

interface CityPillProps {
  city: string
  onRemove?: () => void
  className?: string
}

export function CityPill({ city, onRemove, className }: CityPillProps) {
  return (
    <span
      className={cn(
        'inline-flex min-h-7 max-w-full items-center gap-1.5 overflow-hidden rounded-[3px] border border-line bg-surface-alt px-2 py-1 font-mono text-[11px] leading-none text-text-muted',
        className,
      )}
      title={city}
    >
      <MapPin size={10} className="shrink-0 text-text-faint" />
      <span className="truncate">{city}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${city}`}
          className="ml-0.5 flex size-5 items-center justify-center rounded-sm text-text-faint transition-colors hover:text-text"
        >
          <X size={9} strokeWidth={2} />
        </button>
      )}
    </span>
  )
}
