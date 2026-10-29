import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import type { Doc } from '../../../../convex/_generated/dataModel'
import { CityCombobox } from '@/components/ui/city-combobox'
import { citiesSearchQueryOptions } from '@/features/cities/queries'
import { fieldLabelClass } from './onboarding-shell'

export const NO_CITY_EXPLANATION =
  "no problem: you'll still see global explore, but there's no city feed or city page for you until you set a city in settings → account."

/**
 * City choice with the shared combobox, plus a "can't find my city" path that
 * continues with no city.
 */
export function CityStepFields({
  noCity,
  onNoCityChange,
  onSelectCity,
  selectedCityName,
}: {
  noCity: boolean
  onNoCityChange: (noCity: boolean) => void
  onSelectCity: (city: Doc<'cities'>) => void
  selectedCityName: string | null
}) {
  const [query, setQuery] = useState('')
  const trimmedQuery = query.trim()
  const searchQuery = useQuery(citiesSearchQueryOptions(trimmedQuery))
  const cities = trimmedQuery
    ? ((searchQuery.data as Array<Doc<'cities'>> | undefined) ?? [])
    : []

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor="onboarding-city" className={fieldLabelClass}>
          city
        </label>
        <CityCombobox
          id="onboarding-city"
          label="city"
          query={query}
          onQueryChange={setQuery}
          cities={cities}
          onSelectCity={(city) => {
            onSelectCity(city)
            setQuery('')
          }}
          placeholder={selectedCityName ?? 'search for your city'}
          // The shared Input sizing: 16px on touch (no iOS zoom), 14px from md.
          inputClassName="h-11 text-base md:text-sm"
        />
        {selectedCityName && !noCity && (
          <p className="mt-2 mb-0 font-mono text-[11px] text-text-muted">
            selected: {selectedCityName}
          </p>
        )}
      </div>

      <div className="flex flex-col items-start gap-2">
        <button
          type="button"
          aria-pressed={noCity}
          onClick={() => onNoCityChange(!noCity)}
          className="min-h-11 rounded border border-dashed border-line bg-transparent px-3 font-mono text-[12px] text-text-muted hover:border-line-strong hover:text-text aria-pressed:border-brand aria-pressed:text-text"
        >
          can&apos;t find my city
        </button>
        {noCity && (
          <p className="m-0 font-sans text-[13px] leading-[1.55] text-text-muted">
            {NO_CITY_EXPLANATION}
          </p>
        )}
      </div>
    </div>
  )
}
