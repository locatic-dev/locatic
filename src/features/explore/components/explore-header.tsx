import type { Doc } from '../../../../convex/_generated/dataModel'
import { CityCombobox } from '@/components/ui/city-combobox'
import { CityPill } from '@/components/ui/city-pill'
import { Input } from '@/components/ui/input'
import {
  getExploreScopeStatusCopy,
  type ExploreMode,
  type ExploreScope,
} from '../state'
import type { ExploreCityChip } from '../types'

export function ExploreHeader({
  availableCities,
  cityQuery,
  currentScope,
  mode,
  onCityQueryChange,
  onModeChange,
  onRemoveCity,
  onSelectCity,
  onSearchQueryChange,
  pendingCityIds,
  searchQuery,
  selectedCityChips,
}: {
  availableCities: Array<Doc<'cities'>>
  cityQuery: string
  currentScope: ExploreScope
  mode: ExploreMode
  onCityQueryChange: (query: string) => void
  onModeChange: (mode: ExploreMode) => void
  onRemoveCity: (cityId: string) => void
  onSelectCity: (city: Doc<'cities'>) => void
  onSearchQueryChange: (query: string) => void
  pendingCityIds: boolean
  searchQuery: string
  selectedCityChips: ExploreCityChip[]
}) {
  return (
    <header className="shrink-0 border-b border-line px-(--lx-gutter) py-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1.5 font-mono text-[11px] lowercase text-text-faint">
            // discover {mode === 'builders' ? 'builders' : 'projects'} nearby
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

      <div className="mb-3 flex flex-wrap gap-2">
        {(['projects', 'builders'] as const).map((nextMode) => (
          <button
            key={nextMode}
            type="button"
            onClick={() => onModeChange(nextMode)}
            className={`min-h-11 rounded-md border px-3 py-2 font-mono text-[12px] transition-colors ${
              mode === nextMode
                ? 'border-brand bg-brand-quiet text-brand'
                : 'border-line bg-surface text-text-muted hover:border-line-strong hover:text-text'
            }`}
          >
            {nextMode}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Input
          type="text"
          placeholder={
            mode === 'builders'
              ? 'search builders by username or name'
              : 'search projects by repo, topic, or post'
          }
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          className="border-line bg-canvas font-mono text-sm text-text placeholder:text-text-faint"
          aria-label={
            mode === 'builders' ? 'Search builders' : 'Search projects'
          }
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
