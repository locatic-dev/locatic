import type { Doc } from '../../../../convex/_generated/dataModel'
import { CityCombobox } from '@/components/ui/city-combobox'
import { CityPill } from '@/components/ui/city-pill'
import { Input } from '@/components/ui/input'
import { Search } from '@/lib/icons'
import {
  getExploreScopeStatusCopy,
  type ExploreMode,
  type ExploreScope,
} from '../state'
import type { ExploreCityChip } from '../types'

const EXPLORE_MODE_CONFIG = {
  builders: {
    ariaLabel: 'Search builders',
    placeholder: 'search builders by username or name',
  },
  posts: {
    ariaLabel: 'Search posts',
    placeholder: 'search posts by body or topic',
  },
  projects: {
    ariaLabel: 'Search projects',
    placeholder: 'search projects by repo or topic',
  },
} satisfies Record<ExploreMode, { ariaLabel: string; placeholder: string }>

export function ExploreHeader({
  availableCities,
  cityQuery,
  currentScope,
  mode,
  onCityQueryChange,
  onModeChange,
  onRemoveCity,
  onResetExplore,
  onSelectCity,
  onSearchQueryChange,
  pendingCityIds,
  resetPending,
  searchQuery,
  searchStatusActive,
  selectedCityChips,
}: {
  availableCities: Array<Doc<'cities'>>
  cityQuery: string
  currentScope: ExploreScope
  mode: ExploreMode
  onCityQueryChange: (query: string) => void
  onModeChange: (mode: ExploreMode) => void
  onRemoveCity: (cityId: string) => void
  onResetExplore?: () => void
  onSelectCity: (city: Doc<'cities'>) => void
  onSearchQueryChange: (query: string) => void
  pendingCityIds: boolean
  resetPending?: boolean
  searchQuery: string
  searchStatusActive?: boolean
  selectedCityChips: ExploreCityChip[]
}) {
  const modeConfig = EXPLORE_MODE_CONFIG[mode]
  const canResetExplore = mode === 'projects' || mode === 'posts'

  return (
    <header className="shrink-0 border-b border-line px-(--lx-gutter) py-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1.5 font-mono text-[11px] lowercase text-text-faint">
            // discover {mode} nearby
          </div>
          <h1 className="font-mono text-[22px] font-semibold tracking-[-0.02em] text-text">
            explore
          </h1>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11.5px] text-text-faint">
          <span>
            {getExploreScopeStatusCopy(currentScope, mode, {
              isSearchActive: searchStatusActive,
            })}
          </span>
          {pendingCityIds && <span>saving…</span>}
          {canResetExplore && onResetExplore && (
            <button
              type="button"
              onClick={onResetExplore}
              disabled={resetPending}
              className="min-h-9 rounded-md border border-line px-3 py-1.5 font-mono text-[11.5px] text-text-muted transition-colors hover:border-line-strong hover:text-text disabled:cursor-default disabled:opacity-60"
            >
              {resetPending ? 'resetting…' : 'reset'}
            </button>
          )}
        </div>
      </div>

      {/* Command band: mode + search read as one control center */}
      <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:items-center">
        <div
          role="group"
          aria-label="Explore mode"
          className="inline-flex shrink-0 self-start rounded-md border border-line bg-surface p-0.5 lg:self-auto"
        >
          {(['projects', 'builders', 'posts'] as const).map((nextMode) => (
            <button
              key={nextMode}
              type="button"
              aria-pressed={mode === nextMode}
              onClick={() => onModeChange(nextMode)}
              className={`min-h-9 rounded-[5px] px-3.5 py-1.5 font-mono text-[12px] transition-colors ${
                mode === nextMode
                  ? 'bg-selected text-brand'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              {nextMode}
            </button>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-faint"
          />
          <Input
            type="text"
            placeholder={modeConfig.placeholder}
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            className="h-11 border-line bg-canvas pl-9 font-mono text-sm text-text placeholder:text-text-faint"
            aria-label={modeConfig.ariaLabel}
          />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
        <span className="pt-2 font-mono text-[11px] lowercase text-text-faint">
          near
        </span>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {selectedCityChips.length > 0 ? (
            selectedCityChips.map((city) => (
              <CityPill
                key={city.id}
                city={city.name}
                className="max-w-full shrink sm:max-w-64"
                onRemove={() => onRemoveCity(city.id)}
              />
            ))
          ) : (
            <span className="inline-flex min-h-9 items-center font-mono text-[11.5px] text-text-faint">
              all cities
            </span>
          )}
          <CityCombobox
            id="explore-city"
            label="Add a city filter"
            query={cityQuery}
            onQueryChange={onCityQueryChange}
            cities={availableCities}
            onSelectCity={onSelectCity}
            placeholder="+ add city"
            className="min-w-0 basis-full sm:basis-56 sm:grow-0"
            inputClassName="h-9 text-[12px]"
          />
        </div>
      </div>
    </header>
  )
}
