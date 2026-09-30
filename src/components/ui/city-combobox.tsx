import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import type { Doc } from '../../../convex/_generated/dataModel'
import { Input } from './input'
import { Plus, Search } from '@/lib/icons'
import { cn } from '@/lib/utils'

interface CityComboboxProps {
  id?: string
  label: string
  query: string
  onQueryChange: (query: string) => void
  cities: Array<Doc<'cities'>>
  onSelectCity: (city: Doc<'cities'>) => void
  /**
   * Whether results for `query` are still loading. Callers that pass it get
   * "searching…" and "no cities match" in the popup; without it an empty
   * result keeps the popup closed.
   */
  searching?: boolean
  placeholder?: string
  className?: string
  inputClassName?: string
  maxResults?: number
}

const popupClassName =
  'absolute left-0 z-10 mt-1 w-full overflow-hidden rounded-card border border-line bg-surface shadow-floating md:min-w-80'

/** Region and country, so two cities with one name stay distinguishable. */
function getCityRegionLabel(city: Doc<'cities'>) {
  return [city.region, city.country].filter(Boolean).join(', ')
}

export function CityCombobox({
  id,
  label,
  query,
  onQueryChange,
  cities,
  onSelectCity,
  searching,
  placeholder,
  className,
  inputClassName,
  maxResults = 8,
}: CityComboboxProps) {
  const generatedId = useId()
  const inputId = id ?? `city-combobox-${generatedId}`
  const listboxId = `${inputId}-options`
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const hasQuery = query.trim().length > 0
  const visibleCities = cities.slice(0, maxResults)
  const showListbox = hasQuery && open && visibleCities.length > 0
  const statusMessage =
    hasQuery && open && visibleCities.length === 0 && searching !== undefined
      ? searching
        ? 'searching…'
        : 'no cities match'
      : null
  const activeCity =
    showListbox && activeIndex >= 0 ? visibleCities[activeIndex] : null

  useEffect(() => {
    if (!showListbox) {
      setActiveIndex(-1)
      return
    }

    setActiveIndex((current) =>
      current >= 0 && current < visibleCities.length ? current : 0,
    )
  }, [showListbox, visibleCities.length])

  const close = () => {
    setOpen(false)
    setActiveIndex(-1)
  }

  const selectCity = (city: Doc<'cities'>) => {
    onSelectCity(city)
    close()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      close()
      return
    }

    if (!hasQuery || visibleCities.length === 0) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((current) =>
        current < visibleCities.length - 1 ? current + 1 : 0,
      )
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((current) =>
        current > 0 ? current - 1 : visibleCities.length - 1,
      )
      return
    }

    if (event.key === 'Enter' && activeCity) {
      event.preventDefault()
      selectCity(activeCity)
    }
  }

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
        />
        <Input
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-activedescendant={
            activeCity ? `${listboxId}-${String(activeCity._id)}` : undefined
          }
          aria-autocomplete="list"
          aria-expanded={showListbox}
          aria-controls={showListbox ? listboxId : undefined}
          aria-label={label}
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value
            setOpen(nextQuery.trim().length > 0)
            onQueryChange(nextQuery)
          }}
          onFocus={() => setOpen(hasQuery)}
          onBlur={close}
          onKeyDown={handleKeyDown}
          className={cn('pl-9', inputClassName)}
        />
      </div>

      {showListbox && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={label}
          // Keeps focus in the input (and the list open) on option or
          // scrollbar presses; blur is what closes the list.
          onMouseDown={(event) => event.preventDefault()}
          className={cn(popupClassName, 'max-h-72 overflow-y-auto')}
        >
          {visibleCities.map((city, index) => {
            const regionLabel = getCityRegionLabel(city)

            return (
              <div
                key={String(city._id)}
                id={`${listboxId}-${String(city._id)}`}
                role="option"
                tabIndex={-1}
                aria-selected={index === activeIndex}
                onClick={() => selectCity(city)}
                onMouseEnter={() => setActiveIndex(index)}
                className="relative flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 border-b border-line px-3 py-2 text-left transition-colors before:absolute before:inset-y-0 before:left-0 before:w-0.5 last:border-b-0 aria-selected:bg-selected aria-selected:before:bg-selected-bar"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-mono text-label wrap-anywhere text-text">
                    {city.name}
                  </span>
                  {regionLabel && (
                    <span className="font-mono text-meta wrap-anywhere text-text-muted">
                      {regionLabel}
                    </span>
                  )}
                </span>
                <Plus
                  size={12}
                  aria-hidden="true"
                  className="text-text-muted"
                />
              </div>
            )
          })}
        </div>
      )}

      {statusMessage && (
        <div
          role="status"
          className={cn(
            popupClassName,
            'px-3 py-3 font-mono text-label text-text-muted',
          )}
        >
          {statusMessage}
        </div>
      )}
    </div>
  )
}
