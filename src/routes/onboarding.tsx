import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { Doc } from '../../convex/_generated/dataModel'
import { Logo } from '@/components/ui/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { StatusPill, BUILD_STATUS } from '@/components/ui/status-pill'
import { LangDot } from '@/components/ui/lang-dot'
import { ArrowRight, Star, Pin, Search, Check } from '@/lib/icons'
import { useCompleteOnboarding } from '@/features/onboarding/mutations'
import { viewerQueryOptions } from '@/features/viewer/queries'
import { mineProjectsQueryOptions } from '@/features/projects/queries'
import {
  useListGithubRepositories,
  useImportSelectedRepositories,
} from '@/features/github/actions'
import {
  citiesSearchQueryOptions,
  popularCitiesQueryOptions,
} from '@/features/cities/queries'
import {
  buildPinnedProjectIds,
  deriveStackPrefsFromRepositories,
  type GithubRepositoryListItem,
} from '@/features/onboarding/helpers'
import {
  mapViewerBootstrap,
  type ViewerBootstrapPayload,
} from '@/features/contracts'
import { normalizeSocialLinkValue } from '@/lib/social-links'

export const Route = createFileRoute('/onboarding')({
  beforeLoad: async ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/sign-in' })
    }

    const bootstrap = (await context.queryClient.ensureQueryData(
      viewerQueryOptions(),
    )) as ViewerBootstrapPayload

    if (!bootstrap.needsOnboarding) {
      throw redirect({ to: '/home' })
    }
  },
  component: OnboardingPage,
})

type BuildStatus = keyof typeof BUILD_STATUS

type OnboardingState = {
  bio: string
  bluesky: string
  buildStatus: BuildStatus | ''
  displayName: string
  linkedin: string
  pinnedRepoFullNames: string[]
  selectedRepoFullNames: string[]
  twitter: string
  website: string
}

type GithubRepository = GithubRepositoryListItem & {
  description: string | null
  fullName: string
  githubUrl: string
  lastCommitAt: number
  name: string
  projectUrl: string | null
  repoId: number
  stargazersCount: number
}

const TOTAL_STEPS = 5
const sectionTitleClass =
  'm-0 font-mono text-[26px] font-semibold tracking-[-0.02em] text-text'
const sectionCopyClass = 'mt-2 font-sans text-sm leading-[1.55] text-text-muted'
const fieldLabelClass = 'mb-1.5 block font-mono text-[11.5px] text-text-muted'
const monoInputClass =
  'h-11 border-line bg-canvas font-mono text-sm text-text placeholder:text-text-faint focus-visible:ring-brand/30 focus-visible:ring-offset-0'
const bodyTextareaClass =
  'min-h-[88px] resize-none border-line bg-canvas font-sans text-sm text-text placeholder:text-text-faint focus-visible:ring-brand/30 focus-visible:ring-offset-0'

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 font-mono">
      {Array.from({ length: total }).map((_, index) => (
        <div
          key={index}
          className={`h-1.5 rounded-pill transition-all duration-200 ${
            index === current ? 'w-6' : 'w-1.5'
          } ${index <= current ? 'bg-brand' : 'bg-line'}`}
        />
      ))}
      <span className="ml-2 text-[11.5px] text-text-faint">
        step {current + 1} of {total}
      </span>
    </div>
  )
}

function OnboardingShell({
  children,
  step,
}: {
  children: React.ReactNode
  step: number
}) {
  return (
    <div className="flex w-full max-w-180 flex-col gap-7 rounded-[6px] border border-line bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Logo size={20} />
          <span className="font-mono text-[13px] font-bold text-text">
            locatic
          </span>
        </div>
        <StepDots current={step} total={TOTAL_STEPS} />
      </div>
      {children}
    </div>
  )
}

function OnboardingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const completeOnboarding = useCompleteOnboarding()
  const listGithubRepositories = useListGithubRepositories()
  const importSelectedRepositories = useImportSelectedRepositories()

  const viewerQuery = useQuery(viewerQueryOptions())
  const bootstrap = mapViewerBootstrap(
    viewerQuery.data as ViewerBootstrapPayload | undefined,
  )
  const ownedProjectsQuery = useQuery({
    ...mineProjectsQueryOptions(),
    enabled: Boolean(bootstrap?.viewer),
  })
  const popularCitiesQuery = useQuery(popularCitiesQueryOptions())

  const [step, setStep] = useState(0)
  const [repoFilter, setRepoFilter] = useState('')
  const [citySearch, setCitySearch] = useState('')
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null)
  const [selectedCityName, setSelectedCityName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [repoLoading, setRepoLoading] = useState(true)
  const [repoError, setRepoError] = useState<string | null>(null)
  const [availableRepos, setAvailableRepos] = useState<GithubRepository[]>([])
  const [state, setState] = useState<OnboardingState>({
    bio: '',
    bluesky: '',
    buildStatus: '',
    displayName: '',
    linkedin: '',
    pinnedRepoFullNames: [],
    selectedRepoFullNames: [],
    twitter: '',
    website: '',
  })

  const citySearchResultsQuery = useQuery({
    ...citiesSearchQueryOptions(citySearch.trim() || 'unused'),
    enabled: citySearch.trim().length > 0,
  })

  useEffect(() => {
    let cancelled = false

    const loadRepositories = async () => {
      setRepoLoading(true)
      setRepoError(null)

      try {
        const repositories = (await listGithubRepositories(
          {},
        )) as GithubRepository[]
        if (!cancelled) {
          setAvailableRepos(repositories)
        }
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setRepoError(
            'could not load your public GitHub repositories right now. you can keep going and import later.',
          )
        }
      } finally {
        if (!cancelled) {
          setRepoLoading(false)
        }
      }
    }

    void loadRepositories()

    return () => {
      cancelled = true
    }
  }, [listGithubRepositories])

  useEffect(() => {
    if (!bootstrap?.viewer) {
      return
    }

    setState((current) => {
      if (current.displayName.trim()) {
        return current
      }

      return {
        ...current,
        displayName: bootstrap.viewer?.displayName ?? '',
      }
    })

    if (!selectedCityId && bootstrap.viewer?.cityId) {
      setSelectedCityId(String(bootstrap.viewer.cityId))
      setSelectedCityName(bootstrap.viewer.cityName)
    }
  }, [bootstrap, selectedCityId])

  if (!bootstrap) {
    return <div className="p-8 text-text-faint">loading…</div>
  }

  const githubUsername = bootstrap.viewer?.githubUsername ?? ''
  const filteredRepos = availableRepos.filter((repository) => {
    const query = repoFilter.toLowerCase().trim()
    if (!query) {
      return true
    }

    return (
      repository.fullName.toLowerCase().includes(query) ||
      repository.name.toLowerCase().includes(query)
    )
  })
  const cityResults =
    citySearch.trim().length > 0
      ? ((citySearchResultsQuery.data as Array<Doc<'cities'>> | undefined) ??
        [])
      : ((popularCitiesQuery.data as Array<Doc<'cities'>> | undefined) ?? [])
  const popularCities =
    (popularCitiesQuery.data as Array<Doc<'cities'>> | undefined) ?? []

  const toggleRepo = (fullName: string) => {
    setState((current) => {
      const isSelected = current.selectedRepoFullNames.includes(fullName)
      return {
        ...current,
        pinnedRepoFullNames: isSelected
          ? current.pinnedRepoFullNames.filter(
              (pinnedRepo) => pinnedRepo !== fullName,
            )
          : current.pinnedRepoFullNames,
        selectedRepoFullNames: isSelected
          ? current.selectedRepoFullNames.filter((repo) => repo !== fullName)
          : [...current.selectedRepoFullNames, fullName],
      }
    })
  }

  const togglePin = (fullName: string) => {
    setState((current) => {
      if (!current.selectedRepoFullNames.includes(fullName)) {
        return current
      }

      if (current.pinnedRepoFullNames.includes(fullName)) {
        return {
          ...current,
          pinnedRepoFullNames: current.pinnedRepoFullNames.filter(
            (repo) => repo !== fullName,
          ),
        }
      }

      if (current.pinnedRepoFullNames.length >= 3) {
        return current
      }

      return {
        ...current,
        pinnedRepoFullNames: [...current.pinnedRepoFullNames, fullName],
      }
    })
  }

  const handleFinish = async () => {
    if (!selectedCityId || !state.buildStatus) {
      return
    }

    setSaving(true)

    try {
      if (state.selectedRepoFullNames.length > 0) {
        await importSelectedRepositories({
          fullNames: state.selectedRepoFullNames,
        })
      }

      const ownedProjectsResult = await ownedProjectsQuery.refetch()
      const ownedProjects =
        (ownedProjectsResult.data as Array<Doc<'projects'>> | undefined) ??
        (ownedProjectsQuery.data as Array<Doc<'projects'>> | undefined) ??
        []

      const selectedRepositories = availableRepos.filter((repository) =>
        state.selectedRepoFullNames.includes(repository.fullName),
      )

      await completeOnboarding({
        bio: state.bio.trim(),
        buildStatus: state.buildStatus,
        cityId: selectedCityId as never,
        displayName: state.displayName.trim(),
        exploreCityIds: [selectedCityId as never],
        pinnedOwnedProjectIds: buildPinnedProjectIds(
          state.pinnedRepoFullNames,
          ownedProjects,
        ),
        socialLinks: {
          bluesky: normalizeSocialLinkValue('bluesky', state.bluesky),
          github: githubUsername,
          linkedin: normalizeSocialLinkValue('linkedin', state.linkedin),
          website: normalizeSocialLinkValue('website', state.website),
          x: normalizeSocialLinkValue('x', state.twitter),
        },
        stackPrefs: deriveStackPrefsFromRepositories(selectedRepositories),
      })

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: viewerQueryOptions().queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: mineProjectsQueryOptions().queryKey,
        }),
      ])

      void navigate({ to: '/home', search: {} as never } as never)
    } catch (error) {
      console.error(error)
      setSaving(false)
    }
  }

  const navButtons = (canContinue: boolean, isLast = false) => (
    <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
      <button
        onClick={() => setStep((current) => Math.max(0, current - 1))}
        disabled={step === 0 || saving}
        className="min-h-11 border-0 bg-transparent font-mono text-[12.5px] text-text-faint disabled:cursor-not-allowed disabled:opacity-40"
        type="button"
      >
        ← back
      </button>
      <Button
        variant="brand"
        size="meta"
        disabled={!canContinue || saving}
        onClick={
          isLast
            ? () => void handleFinish()
            : () => setStep((current) => current + 1)
        }
        className="gap-2 font-mono font-semibold"
      >
        {isLast ? (saving ? 'saving…' : 'finish') : 'continue'}
        {!isLast && <ArrowRight size={13} strokeWidth={2} />}
      </Button>
    </div>
  )

  return (
    <div className="flex min-h-dvh flex-col items-center bg-canvas px-(--lx-gutter) py-8">
      {step === 0 && (
        <OnboardingShell step={0}>
          <div>
            <h1 className={sectionTitleClass}>pick what to show</h1>
            <p className={sectionCopyClass}>
              import your public repos from GitHub. pin up to 3 for the top of
              your profile. you can skip this and come back later.
            </p>
          </div>

          <div className="flex items-center justify-between font-mono text-[11.5px] text-text-faint">
            <span>{state.selectedRepoFullNames.length} selected</span>
            <span className="text-brand">
              {state.pinnedRepoFullNames.length}/3 pinned
            </span>
          </div>

          <div className="overflow-hidden rounded border border-line bg-canvas">
            <div className="flex items-center gap-2.5 border-b border-line bg-surface-alt px-3.5 py-2.5">
              <Search size={13} strokeWidth={1.4} className="text-text-faint" />
              <input
                id="repo-filter"
                name="repoFilter"
                value={repoFilter}
                onChange={(event) => setRepoFilter(event.target.value)}
                placeholder="filter repos…"
                className="flex-1 border-0 bg-transparent font-mono text-xs text-text outline-none placeholder:text-text-faint"
              />
              <span className="font-mono text-[11px] text-text-faint">
                {repoLoading ? 'loading…' : `${availableRepos.length} public`}
              </span>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {repoError && (
                <div className="px-4 py-4.5 font-sans text-[13px] leading-[1.6] text-text-muted">
                  {repoError}
                </div>
              )}

              {!repoError && repoLoading && (
                <div className="px-4 py-4.5 font-mono text-xs text-text-faint">
                  loading repositories…
                </div>
              )}

              {!repoError && !repoLoading && filteredRepos.length === 0 && (
                <div className="px-4 py-4.5 font-sans text-[13px] text-text-muted">
                  no repositories matched that filter.
                </div>
              )}

              {!repoError &&
                filteredRepos.map((repository, index) => {
                  const isSelected = state.selectedRepoFullNames.includes(
                    repository.fullName,
                  )
                  const isPinned = state.pinnedRepoFullNames.includes(
                    repository.fullName,
                  )

                  return (
                    <div
                      key={repository.fullName}
                      onClick={() => toggleRepo(repository.fullName)}
                      className={`flex cursor-pointer items-center gap-3.5 px-3.5 py-3 ${
                        index > 0 ? 'border-t border-line' : ''
                      } ${isSelected ? 'bg-brand/5' : 'bg-transparent'}`}
                    >
                      <div
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] ${
                          isSelected
                            ? 'bg-brand text-brand-foreground'
                            : 'border-[1.5px] border-line-strong bg-transparent'
                        }`}
                      >
                        {isSelected && <Check size={11} strokeWidth={2.4} />}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="mb-0.75 flex flex-wrap items-center gap-2.5">
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
                        </div>
                        <div className="font-sans text-[12.5px] text-text-muted wrap-anywhere">
                          {repository.description || 'no description provided'}
                        </div>
                      </div>

                      {isSelected && (
                        <button
                          onClick={(event) => {
                            event.stopPropagation()
                            togglePin(repository.fullName)
                          }}
                          className={`inline-flex items-center gap-1 rounded-[3px] border px-2.5 py-1.25 font-mono text-[10.5px] ${
                            isPinned
                              ? 'border-brand/40 bg-brand/10 text-brand'
                              : 'border-line bg-transparent text-text-faint'
                          }`}
                          type="button"
                        >
                          <Pin
                            size={10}
                            fill={isPinned ? 'currentColor' : 'none'}
                            strokeWidth={1.4}
                          />
                          {isPinned ? 'pinned' : 'pin'}
                        </button>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>

          {navButtons(true)}
        </OnboardingShell>
      )}

      {step === 1 && (
        <OnboardingShell step={1}>
          <div>
            <h1 className={sectionTitleClass}>your profile</h1>
            <p className={sectionCopyClass}>how other builders will see you.</p>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label className={fieldLabelClass}>display name</label>
              <Input
                value={state.displayName}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    displayName: event.target.value,
                  }))
                }
                placeholder="how you want to appear"
                className={monoInputClass}
              />
            </div>

            <div>
              <label className={fieldLabelClass}>city</label>
              <Input
                value={citySearch}
                onChange={(event) => setCitySearch(event.target.value)}
                placeholder={selectedCityName ?? 'search for your city'}
                className={monoInputClass}
              />
              {selectedCityName && (
                <div className="mt-2 font-mono text-[11px] text-text-faint">
                  selected: {selectedCityName}
                </div>
              )}
              {(citySearch.trim() ? cityResults : popularCities)
                .slice(0, 6)
                .map((city) => (
                  <button
                    key={String(city._id)}
                    onClick={() => {
                      setSelectedCityId(String(city._id))
                      setSelectedCityName(city.displayName)
                      setCitySearch('')
                    }}
                    className="mt-2 w-full rounded border border-dashed border-line bg-transparent px-2.5 py-2 text-left font-mono text-[11.5px] text-text-muted"
                    type="button"
                  >
                    {city.displayName}
                  </button>
                ))}
            </div>

            <div>
              <label className={fieldLabelClass}>
                one-line bio{' '}
                <span className="text-text-faint">
                  ({state.bio.length}/140)
                </span>
              </label>
              <Textarea
                value={state.bio}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    bio: event.target.value.slice(0, 140),
                  }))
                }
                placeholder="what are you building?"
                rows={2}
                className={bodyTextareaClass}
              />
            </div>
          </div>

          {navButtons(
            Boolean(state.displayName.trim()) && Boolean(selectedCityId),
          )}
        </OnboardingShell>
      )}

      {step === 2 && (
        <OnboardingShell step={2}>
          <div>
            <h1 className={sectionTitleClass}>what are you up to?</h1>
            <p className={sectionCopyClass}>
              this shows on your profile and project cards. change it whenever.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {(
              Object.entries(BUILD_STATUS) as Array<
                [BuildStatus, (typeof BUILD_STATUS)[BuildStatus]]
              >
            ).map(([id, meta]) => {
              const isSelected = state.buildStatus === id

              return (
                <button
                  key={id}
                  onClick={() =>
                    setState((current) => ({ ...current, buildStatus: id }))
                  }
                  className={`flex flex-col gap-2 rounded border px-4 py-3.5 text-left ${
                    isSelected
                      ? 'border-brand bg-brand/5'
                      : 'border-line bg-canvas'
                  }`}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <StatusPill status={id} size="md" />
                    <div
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full ${
                        isSelected
                          ? 'bg-brand'
                          : 'border-[1.5px] border-line-strong bg-transparent'
                      }`}
                    >
                      {isSelected && (
                        <div className="h-1.25 w-1.25 rounded-full bg-canvas" />
                      )}
                    </div>
                  </div>
                  <div className="font-sans text-[12.5px] leading-[1.55] text-text-muted">
                    {meta.label}
                  </div>
                </button>
              )
            })}
          </div>

          {navButtons(Boolean(state.buildStatus))}
        </OnboardingShell>
      )}

      {step === 3 && (
        <OnboardingShell step={3}>
          <div>
            <h1 className={sectionTitleClass}>social links</h1>
            <p className={sectionCopyClass}>
              all optional. these show on your profile.
            </p>
          </div>

          <div className="flex flex-col gap-3.5">
            {(
              [
                {
                  key: 'twitter',
                  label: 'x',
                  placeholder: '@username',
                },
                {
                  key: 'linkedin',
                  label: 'linkedin',
                  placeholder: 'linkedin.com/in/username',
                },
                {
                  key: 'bluesky',
                  label: 'bluesky',
                  placeholder: '@username.bsky.social',
                },
                {
                  key: 'website',
                  label: 'personal site',
                  placeholder: 'https://yoursite.dev',
                },
              ] as const
            ).map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className={fieldLabelClass}>{label}</label>
                <Input
                  value={state[key]}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                  placeholder={placeholder}
                  className={monoInputClass}
                />
              </div>
            ))}
          </div>

          {navButtons(true)}
        </OnboardingShell>
      )}

      {step === 4 && (
        <OnboardingShell step={4}>
          <div className="py-6 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-brand bg-brand/15">
              <Check size={24} className="text-brand" />
            </div>
            <h1 className="mb-3 font-mono text-[26px] font-semibold tracking-[-0.02em] text-text">
              you&apos;re all set.
            </h1>
            <p className="mx-auto max-w-105 font-sans text-sm leading-[1.6] text-text-muted">
              we&apos;ll finish importing your selected repos, save your city,
              and build your first profile view.
            </p>
            <div className="mt-5 inline-flex flex-col gap-1.5 font-mono text-[11.5px] text-text-faint">
              <span>{state.selectedRepoFullNames.length} repos selected</span>
              <span>{state.pinnedRepoFullNames.length} repos pinned</span>
              <span>{selectedCityName ?? 'city not selected yet'}</span>
            </div>
          </div>

          {navButtons(
            Boolean(selectedCityId) && Boolean(state.buildStatus),
            true,
          )}
        </OnboardingShell>
      )}
    </div>
  )
}
