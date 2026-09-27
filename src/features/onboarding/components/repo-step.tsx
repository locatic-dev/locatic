import { useState } from 'react'

import { Input } from '@/components/ui/input'
import { LangDot } from '@/components/ui/lang-dot'
import { Check, Search, Star } from '@/lib/icons'
import type { GithubRepositoryListItem } from '@/features/onboarding/helpers'

export type GithubRepository = GithubRepositoryListItem & {
  description: string | null
  fullName: string
  githubUrl: string
  lastCommitAt: number
  name: string
  projectUrl: string | null
  repoId: number
  stargazersCount: number
}

function matchesFilter(repository: GithubRepository, filter: string) {
  const query = filter.toLowerCase().trim()
  return (
    !query ||
    repository.fullName.toLowerCase().includes(query) ||
    repository.name.toLowerCase().includes(query)
  )
}

/**
 * Public repositories to import. Each row is a toggle button
 * (`aria-pressed`), so Tab reaches it and Enter or Space selects it.
 */
export function RepoStepFields({
  error,
  loading,
  onToggle,
  repositories,
  selectedFullNames,
}: {
  error: string | null
  loading: boolean
  onToggle: (fullName: string) => void
  repositories: GithubRepository[]
  selectedFullNames: string[]
}) {
  const [filter, setFilter] = useState('')
  const filteredRepositories = repositories.filter((repository) =>
    matchesFilter(repository, filter),
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between font-mono text-[11.5px] text-text-faint">
        <span aria-live="polite">{selectedFullNames.length} selected</span>
        <span>imports from GitHub</span>
      </div>

      <div className="overflow-hidden rounded border border-line bg-canvas">
        <div className="flex items-center gap-2.5 border-b border-line bg-surface-alt px-3.5 py-1.5">
          <Search
            size={13}
            strokeWidth={1.4}
            className="shrink-0 text-text-faint"
          />
          <label htmlFor="repo-filter" className="sr-only">
            filter repositories
          </label>
          <Input
            id="repo-filter"
            name="repoFilter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="filter repos…"
            className="h-9 flex-1 border-0 bg-transparent px-1"
          />
          <span className="shrink-0 font-mono text-[11px] text-text-faint">
            {loading ? 'loading…' : `${repositories.length} public`}
          </span>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {error && (
            <p className="m-0 px-4 py-4.5 font-sans text-[13px] leading-[1.6] text-text-muted">
              {error}
            </p>
          )}

          {!error && loading && (
            <p className="m-0 px-4 py-4.5 font-mono text-xs text-text-faint">
              loading repositories…
            </p>
          )}

          {!error && !loading && filteredRepositories.length === 0 && (
            <p className="m-0 px-4 py-4.5 font-sans text-[13px] text-text-muted">
              {repositories.length === 0
                ? 'no public repositories found.'
                : 'no repositories matched that filter.'}
            </p>
          )}

          {!error && filteredRepositories.length > 0 && (
            <ul className="m-0 list-none p-0">
              {filteredRepositories.map((repository, index) => {
                const isSelected = selectedFullNames.includes(
                  repository.fullName,
                )

                return (
                  <li
                    key={repository.fullName}
                    className={index > 0 ? 'border-t border-line' : undefined}
                  >
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => onToggle(repository.fullName)}
                      className={`flex w-full cursor-pointer items-center gap-3.5 border-0 px-3.5 py-3 text-left ${
                        isSelected ? 'bg-brand/5' : 'bg-transparent'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-control ${
                          isSelected
                            ? 'bg-brand text-brand-foreground'
                            : 'border-[1.5px] border-line-strong bg-transparent'
                        }`}
                      >
                        {isSelected && <Check size={11} strokeWidth={2.4} />}
                      </span>

                      <span className="block min-w-0 flex-1">
                        <span className="mb-0.75 flex flex-wrap items-center gap-2.5">
                          <span className="font-mono text-[13px] font-semibold text-text">
                            {repository.fullName}
                          </span>
                          {repository.primaryLanguage && (
                            <span className="inline-flex items-center gap-1 rounded-[2px] border border-line bg-surface-alt px-1.5 py-0.5 font-mono text-[10.5px] leading-none text-text-muted">
                              <LangDot
                                lang={repository.primaryLanguage}
                                size={6}
                              />
                              {repository.primaryLanguage}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-0.75 font-mono text-[11px] text-text-faint">
                            <Star size={10} strokeWidth={1.4} />
                            {repository.stargazersCount.toLocaleString()}
                          </span>
                        </span>
                        <span className="block font-sans text-[12.5px] text-text-muted wrap-anywhere">
                          {repository.description || 'no description provided'}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
