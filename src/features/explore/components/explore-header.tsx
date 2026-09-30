import * as m from 'motion/react-m'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search } from '@/lib/icons'
import { indicatorSpring, pressScale } from '@/lib/motion'
import {
  getExploreEyebrowCopy,
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

const EXPLORE_MODE_ORDER = ['projects', 'builders', 'posts'] as const

/**
 * The Explore band: eyebrow, title with the scope status, then the mode tabs
 * and search. The city card and filters live in the rail (xl) or the filter
 * sheet, which the compact strip opens below xl.
 */
export function ExploreHeader({
  activeFilterCount,
  currentScope,
  filtersOpen,
  mode,
  onModeChange,
  onOpenFilters,
  onSearchQueryChange,
  searchQuery,
  searchStatusActive,
  selectedCityChips,
  showSearch = true,
  strip,
}: {
  /** Applied filters plus one for a city selection; shown on the strip. */
  activeFilterCount: number
  currentScope: ExploreScope
  /** Whether the filter sheet is open; the filters button reports it. */
  filtersOpen: boolean
  mode: ExploreMode
  onModeChange: (mode: ExploreMode) => void
  /** Opens the filter sheet (below xl). */
  onOpenFilters: () => void
  onSearchQueryChange: (query: string) => void
  searchQuery: string
  searchStatusActive?: boolean
  selectedCityChips: ExploreCityChip[]
  /** Text search needs a signed-in viewer; public Explore browses only. */
  showSearch?: boolean
  /** Compact strip below xl: "hyderabad · 142 builders". */
  strip: { place: string; builderCount: number | null }
}) {
  const modeConfig = EXPLORE_MODE_CONFIG[mode]

  return (
    <header
      aria-labelledby="explore-title"
      className="shrink-0 border-b border-line px-(--lx-gutter) pt-4 xl:pb-3"
    >
      <div className="lx-page-width-wide flex flex-col gap-3">
        <p className="m-0 text-eyebrow text-text-muted">
          //{' '}
          {getExploreEyebrowCopy({
            cityCount: selectedCityChips.length,
            mode,
            scope: currentScope,
          })}
        </p>
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
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div role="group" aria-label="Explore mode" className="inline-flex">
            {EXPLORE_MODE_ORDER.map((nextMode) => {
              const isActive = mode === nextMode

              return (
                <m.button
                  key={nextMode}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onModeChange(nextMode)}
                  whileTap={pressScale}
                  className={`relative h-9 px-3 font-mono text-label transition-colors pointer-coarse:min-h-11 ${
                    isActive ? 'text-text' : 'text-text-muted hover:text-text'
                  }`}
                >
                  {nextMode}
                  {isActive && (
                    <m.span
                      layoutId="explore-mode-indicator"
                      transition={indicatorSpring}
                      className="absolute inset-x-3 -bottom-px h-0.5 rounded-pill bg-brand"
                    />
                  )}
                </m.button>
              )
            })}
          </div>

          {showSearch && (
            <div className="relative min-w-0 grow basis-64 md:max-w-96">
              <Search
                size={16}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
              />
              <Input
                type="text"
                placeholder={modeConfig.placeholder}
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                className="h-9 pl-9 pointer-coarse:h-11"
                aria-label={modeConfig.ariaLabel}
              />
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 pb-3 xl:hidden">
          <p className="m-0 min-w-0 truncate font-mono text-label text-text-muted">
            <span className="text-place">{strip.place}</span>
            {strip.builderCount !== null &&
              ` · ${strip.builderCount.toLocaleString()} ${
                strip.builderCount === 1 ? 'builder' : 'builders'
              }`}
          </p>
          <Button
            size="sm"
            aria-haspopup="dialog"
            aria-expanded={filtersOpen}
            className="pointer-coarse:min-h-11"
            onClick={onOpenFilters}
          >
            filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            <span aria-hidden="true">▾</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
