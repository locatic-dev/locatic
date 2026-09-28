import * as m from 'motion/react-m'
import type { Doc } from '../../../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { CityCombobox } from '@/components/ui/city-combobox'
import { CityPill } from '@/components/ui/city-pill'
import { Input } from '@/components/ui/input'
import { Search } from '@/lib/icons'
import { indicatorSpring, pressScale } from '@/lib/motion'
import {
  getExploreEyebrowCopy,
  getExploreScopeStatusCopy,
  type ExploreFilters,
  type ExploreMode,
  type ExploreScope,
} from '../state'
import type { ExploreCityChip } from '../types'
import { ExploreFilterBar } from './explore-filters'

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

const EXPLORE_MODE_ORDER = ['projects', 'builders', 'posts'] as const

/** The city filter field; other Explore controls return focus here. */
export const EXPLORE_CITY_INPUT_ID = 'explore-city'

/**
 * One band: eyebrow, title with the scope status, then mode, search, city and
 * filter controls (D2, D3) in a single wrapping row (three short rows at
 * 390px).
 */
export function ExploreHeader({
  availableCities,
  cityQuery,
  citySearchPending,
  currentScope,
  filters,
  mode,
  onCityQueryChange,
  onFiltersChange,
  onModeChange,
  onRemoveCity,
  onResetExplore,
  onSelectCity,
  onSearchQueryChange,
  resetPending,
  searchQuery,
  searchStatusActive,
  selectedCityChips,
  showSearch = true,
}: {
  availableCities: Array<Doc<'cities'>>
  cityQuery: string
  citySearchPending: boolean
  currentScope: ExploreScope
  /** URL filters; the bar shows the ones for the current mode. */
  filters: ExploreFilters
  mode: ExploreMode
  onCityQueryChange: (query: string) => void
  onFiltersChange: (next: ExploreFilters) => void
  onModeChange: (mode: ExploreMode) => void
  onRemoveCity: (cityId: string) => void
  onResetExplore?: () => void
  onSelectCity: (city: Doc<'cities'>) => void
  onSearchQueryChange: (query: string) => void
  resetPending?: boolean
  searchQuery: string
  searchStatusActive?: boolean
  selectedCityChips: ExploreCityChip[]
  /** Text search needs a signed-in viewer; public Explore browses only. */
  showSearch?: boolean
}) {
  const modeConfig = EXPLORE_MODE_CONFIG[mode]
  const canResetExplore = mode === 'projects' || mode === 'posts'

  return (
    <header
      aria-labelledby="explore-title"
      className="shrink-0 border-b border-line px-(--lx-gutter) py-3 md:py-4"
    >
      <p className="m-0 font-mono text-meta text-text-faint">
        //{' '}
        {getExploreEyebrowCopy({
          cityCount: selectedCityChips.length,
          mode,
          scope: currentScope,
        })}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <h1 id="explore-title" className="m-0 text-headline text-text">
            explore
          </h1>
          <span aria-live="polite" className="font-mono text-label text-place">
            {getExploreScopeStatusCopy({
              cities: selectedCityChips,
              isSearchActive: searchStatusActive,
            })}
          </span>
        </div>
        {canResetExplore && onResetExplore && (
          <Button
            variant="ghost"
            size="touch"
            onClick={onResetExplore}
            disabled={resetPending}
          >
            {resetPending ? 'resetting…' : 'reset'}
          </Button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Explore mode"
          className="inline-flex shrink-0 rounded-control border border-line bg-surface p-0.5"
        >
          {EXPLORE_MODE_ORDER.map((nextMode) => {
            const isActive = mode === nextMode

            return (
              <m.button
                key={nextMode}
                type="button"
                aria-pressed={isActive}
                onClick={() => onModeChange(nextMode)}
                whileTap={pressScale}
                className={`relative min-h-11 rounded-control px-3.5 font-mono text-label transition-colors ${
                  isActive ? 'text-brand' : 'text-text-muted hover:text-text'
                }`}
              >
                {isActive && (
                  <m.span
                    layoutId="explore-mode-indicator"
                    transition={indicatorSpring}
                    className="absolute inset-0 rounded-control bg-selected"
                  />
                )}
                <span className="relative">{nextMode}</span>
              </m.button>
            )
          })}
        </div>

        {showSearch && (
          <div className="relative min-w-0 grow basis-64">
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-faint"
            />
            <Input
              type="text"
              placeholder={modeConfig.placeholder}
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              className="h-11 pl-9"
              aria-label={modeConfig.ariaLabel}
            />
          </div>
        )}

        <div className="flex min-w-0 grow flex-wrap items-center gap-2 md:grow-0">
          {selectedCityChips.map((city) => (
            <CityPill
              key={city.id}
              city={city.name}
              truncate={false}
              className="max-w-full shrink"
              onRemove={() => {
                onRemoveCity(city.id)
                // The removed chip's button unmounts; continue at the city
                // field rather than losing focus to the page.
                document.getElementById(EXPLORE_CITY_INPUT_ID)?.focus()
              }}
            />
          ))}
          <CityCombobox
            id={EXPLORE_CITY_INPUT_ID}
            label="Add a city filter"
            query={cityQuery}
            onQueryChange={onCityQueryChange}
            cities={availableCities}
            searching={citySearchPending}
            onSelectCity={onSelectCity}
            placeholder="+ add city"
            className="min-w-0 grow basis-40 md:w-80 md:grow-0 md:basis-auto"
            inputClassName="h-11"
          />
          <ExploreFilterBar
            filters={filters}
            mode={mode}
            onFiltersChange={onFiltersChange}
          />
        </div>
      </div>
    </header>
  )
}
