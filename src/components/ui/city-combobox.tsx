import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
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
  placeholder?: string
  className?: string
  inputClassName?: string
  maxResults?: number
}

export function CityCombobox({
  id,
  label,
  query,
  onQueryChange,
  cities,
  onSelectCity,
  placeholder,
  className,
  inputClassName,
  maxResults = 8,
}: CityComboboxProps) {
  const generatedId = useId()
  const inputId = id ?? `city-combobox-${generatedId}`
  const listboxId = `${inputId}-options`
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const visibleCities = cities.slice(0, maxResults)
  const showDropdown = open && visibleCities.length > 0
  const activeCity = activeIndex >= 0 ? visibleCities[activeIndex] : null

  useEffect(() => {
    if (!showDropdown) {
      setActiveIndex(-1)
      return
    }

    setActiveIndex((current) =>
      current >= 0 && current < visibleCities.length ? current : 0,
    )
  }, [showDropdown, visibleCities.length])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const selectCity = (city: Doc<'cities'>) => {
    onSelectCity(city)
    setOpen(false)
    setActiveIndex(-1)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
      return
    }

    if (visibleCities.length === 0) {
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
    <div ref={rootRef} className={cn('relative', className)}>
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-faint"
        />
        <Input
          id={inputId}
          type="text"
          role="combobox"
          aria-activedescendant={
            activeCity ? `${listboxId}-${String(activeCity._id)}` : undefined
          }
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-label={label}
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            setOpen(true)
            onQueryChange(event.target.value)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className={cn(
            'border-line bg-canvas pl-9 font-mono text-sm text-text placeholder:text-text-faint',
            inputClassName,
          )}
        />
      </div>

      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-2 max-h-72 w-full overflow-y-auto rounded-card border border-line bg-surface shadow-floating"
        >
          {visibleCities.map((city, index) => (
            <div
              key={String(city._id)}
              id={`${listboxId}-${String(city._id)}`}
              role="option"
              tabIndex={-1}
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectCity(city)}
              onMouseEnter={() => setActiveIndex(index)}
              className={cn(
                'flex min-h-11 w-full items-center justify-between gap-3 border-b border-line px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-surface-alt',
                index === activeIndex && 'bg-surface-alt',
              )}
            >
              <span className="font-mono text-[12px] text-text">
                {city.displayName}
              </span>
              <Plus size={12} className="text-text-faint" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
