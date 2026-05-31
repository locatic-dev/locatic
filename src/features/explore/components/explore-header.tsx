import type { Doc } from '../../../../convex/_generated/dataModel'
import { CityCombobox } from '@/components/ui/city-combobox'
import { CityPill } from '@/components/ui/city-pill'
import { Input } from '@/components/ui/input'
import { getExploreScopeStatusCopy, type ExploreScope } from '../state'
import type { ExploreCityChip } from '../types'

export function ExploreHeader({
  availableCities,
  builderQuery,
  cityQuery,
  currentScope,
  onBuilderQueryChange,
  onCityQueryChange,
  onRemoveCity,
  onSelectCity,
  pendingCityIds,
  selectedCityChips,
}: {
  availableCities: Array<Doc<'cities'>>
  builderQuery: string
  cityQuery: string
  currentScope: ExploreScope
  onBuilderQueryChange: (query: string) => void
  onCityQueryChange: (query: string) => void
  onRemoveCity: (cityId: string) => void
  onSelectCity: (city: Doc<'cities'>) => void
  pendingCityIds: boolean
  selectedCityChips: ExploreCityChip[]
}) {
  return (
    <header className="shrink-0 border-b border-line px-(--lx-gutter) py-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1.5 font-mono text-[11px] lowercase text-text-faint">
            // discover builders and projects nearby
          </div>
          <h1 className="font-mono text-[22px] font-semibold tracking-[-0.02em] text-text">
            explore
          </h1>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11.5px] text-text-faint">
          <span>{getExploreScopeStatusCopy(currentScope)}</span>
          {pendingCityIds && <span>saving…</span>}
        </div>
      </div>

      {selectedCityChips.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {selectedCityChips.map((city) => (
            <CityPill
              key={city.id}
              city={city.name}
              className="shrink-0"
              onRemove={() => onRemoveCity(city.id)}
            />
          ))}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Input
          type="text"
          placeholder="search builders by username or name"
          value={builderQuery}
          onChange={(event) => onBuilderQueryChange(event.target.value)}
          className="border-line bg-canvas font-mono text-sm text-text placeholder:text-text-faint"
          aria-label="Search builders"
        />

        <CityCombobox
          id="explore-city"
          label="Search and add city filters"
          query={cityQuery}
          onQueryChange={onCityQueryChange}
          cities={availableCities}
          onSelectCity={onSelectCity}
          placeholder="search and add city filters"
        />
      </div>
    </header>
  )
}
