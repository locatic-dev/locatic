import {
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LangDot } from '@/components/ui/lang-dot'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Plus, X } from '@/lib/icons'
import { cn } from '@/lib/utils'
import {
  EXPLORE_FILTER_MAX_LENGTH,
  normalizeExploreLanguageFilter,
  normalizeExploreTopicFilter,
  type ExploreFilters,
  type ExploreMode,
} from '../state'

const chipClassName =
  'inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-pill border px-2.5 py-1 font-mono text-meta leading-none'
const appliedChipClassName = 'border-brand/40 bg-selected text-text'

/** An applied filter: its label and a 44px remove target. */
function FilterChip({
  children,
  removeLabel,
  onRemove,
}: {
  children: ReactNode
  removeLabel: string
  onRemove: () => void
}) {
  return (
    <span className={cn(chipClassName, appliedChipClassName)}>
      <span className="min-w-0 wrap-anywhere">{children}</span>
      {/* 24px with a mouse; on coarse pointers a 44px target overhangs the
          28px chip, like the city chip's remove target. */}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="-my-1 -mr-1.5 flex size-6 items-center justify-center rounded-md text-text-muted transition-colors hover:text-text pointer-coarse:-my-3 pointer-coarse:-mr-2 pointer-coarse:size-11"
      >
        <X size={9} strokeWidth={2} />
      </button>
    </span>
  )
}

/**
 * The two project filters behind one "filter" button, so the header band
 * keeps its height at 390px; applied filters show as chips beside it.
 */
function ProjectFilterPopover({
  filters,
  onFiltersChange,
  triggerRef,
}: {
  filters: ExploreFilters
  onFiltersChange: (next: ExploreFilters) => void
  triggerRef: RefObject<HTMLButtonElement | null>
}) {
  const [open, setOpen] = useState(false)
  const [language, setLanguage] = useState('')
  const [topic, setTopic] = useState('')

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setLanguage(filters.language ?? '')
      setTopic(filters.topic ?? '')
    }
    setOpen(nextOpen)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onFiltersChange({
      language: normalizeExploreLanguageFilter(language),
      topic: normalizeExploreTopicFilter(topic),
    })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button ref={triggerRef} variant="secondary" size="touch">
          <Plus size={14} />
          filter
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <form
          aria-label="Project filters"
          className="flex flex-col gap-3"
          onSubmit={handleSubmit}
        >
          <label className="flex flex-col gap-1 font-mono text-meta text-text-muted">
            primary language
            <Input
              type="text"
              placeholder="e.g. typescript"
              value={language}
              maxLength={EXPLORE_FILTER_MAX_LENGTH}
              onChange={(event) => setLanguage(event.target.value)}
              className="h-11"
            />
          </label>
          <label className="flex flex-col gap-1 font-mono text-meta text-text-muted">
            topic
            <Input
              type="text"
              placeholder="e.g. ai-agents"
              value={topic}
              maxLength={EXPLORE_FILTER_MAX_LENGTH}
              onChange={(event) => setTopic(event.target.value)}
              className="h-11"
            />
          </label>
          <Button type="submit" variant="primary" size="touch">
            apply
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Filter controls for the header band, laid out inline with the city
 * controls: primary language and topic in projects mode,
 * "open to collab" in builders mode. Each lives in the URL, so a
 * filtered Explore link is shareable and survives a reload.
 */
export function ExploreFilterBar({
  filters,
  mode,
  onFiltersChange,
}: {
  filters: ExploreFilters
  mode: ExploreMode
  onFiltersChange: (next: ExploreFilters) => void
}) {
  // Removing a chip unmounts its button; focus moves to the "filter" button
  // beside the chips instead of falling back to the page.
  const filterTriggerRef = useRef<HTMLButtonElement>(null)
  const removeFilter = (next: ExploreFilters) => {
    onFiltersChange(next)
    filterTriggerRef.current?.focus()
  }

  if (mode === 'builders') {
    const pressed = filters.openToCollab === true
    return (
      <button
        type="button"
        aria-pressed={pressed}
        onClick={() =>
          onFiltersChange({ openToCollab: pressed ? undefined : true })
        }
        className={cn(
          chipClassName,
          'min-h-8 px-3.5 text-label transition-colors pointer-coarse:min-h-11',
          pressed
            ? appliedChipClassName
            : 'border-line bg-surface text-text-muted hover:border-line-strong hover:text-text',
        )}
      >
        open to collab
      </button>
    )
  }

  if (mode !== 'projects') return null

  return (
    <>
      {filters.language && (
        <FilterChip
          removeLabel={`Remove primary language filter ${filters.language}`}
          onRemove={() => removeFilter({ language: undefined })}
        >
          primary language: {filters.language}
        </FilterChip>
      )}
      {filters.topic && (
        <FilterChip
          removeLabel={`Remove topic filter ${filters.topic}`}
          onRemove={() => removeFilter({ topic: undefined })}
        >
          topic: #{filters.topic}
        </FilterChip>
      )}
      <ProjectFilterPopover
        filters={filters}
        onFiltersChange={onFiltersChange}
        triggerRef={filterTriggerRef}
      />
    </>
  )
}

/** Languages the rail offers as one-click primary-language filters. */
export const RAIL_LANGUAGES = [
  'TypeScript',
  'JavaScript',
  'Python',
  'Go',
  'Rust',
  'Swift',
  'Kotlin',
  'Ruby',
] as const

/**
 * One-click primary-language filters for the rail. Each toggle sets the
 * language in its canonical (URL) form and reports it through
 * `aria-pressed`; pressing the applied language clears it.
 */
export function LanguageQuickPicks({
  filters,
  onFiltersChange,
}: {
  filters: ExploreFilters
  onFiltersChange: (next: ExploreFilters) => void
}) {
  return (
    <ul
      aria-label="languages"
      className="m-0 flex list-none flex-wrap gap-1.5 p-0"
    >
      {RAIL_LANGUAGES.map((name) => {
        const language = normalizeExploreLanguageFilter(name)
        const pressed = filters.language === language
        return (
          <li key={name}>
            <button
              type="button"
              aria-pressed={pressed}
              onClick={() =>
                onFiltersChange({ language: pressed ? undefined : language })
              }
              className={cn(
                chipClassName,
                'transition-colors pointer-coarse:min-h-11',
                pressed
                  ? appliedChipClassName
                  : 'border-line bg-transparent text-text-muted hover:border-line-strong hover:text-text',
              )}
            >
              <LangDot lang={name} />
              {name}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
