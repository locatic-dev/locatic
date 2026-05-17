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

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: 'var(--lx-font-mono)',
      }}
    >
      {Array.from({ length: total }).map((_, index) => (
        <div
          key={index}
          style={{
            width: index === current ? 24 : 6,
            height: 6,
            borderRadius: 3,
            background:
              index <= current ? 'var(--lx-accent)' : 'var(--lx-border)',
            transition: 'all .2s',
          }}
        />
      ))}
      <span
        style={{ fontSize: 11.5, color: 'var(--lx-text-3)', marginLeft: 8 }}
      >
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
    <div
      style={{
        width: '100%',
        maxWidth: 720,
        background: 'var(--lx-surface)',
        border: '1px solid var(--lx-border)',
        borderRadius: 6,
        padding: '32px 40px 36px',
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo size={20} />
          <span
            style={{
              fontFamily: 'var(--lx-font-mono)',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--lx-text)',
            }}
          >
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
    return (
      <div style={{ padding: 32, color: 'var(--lx-text-3)' }}>loading…</div>
    )
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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 'auto',
      }}
    >
      <button
        onClick={() => setStep((current) => Math.max(0, current - 1))}
        disabled={step === 0 || saving}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--lx-text-3)',
          fontFamily: 'var(--lx-font-mono)',
          fontSize: 12.5,
          cursor: step === 0 || saving ? 'not-allowed' : 'pointer',
          opacity: step === 0 || saving ? 0.4 : 1,
        }}
        type="button"
      >
        ← back
      </button>
      <Button
        disabled={!canContinue || saving}
        onClick={
          isLast
            ? () => void handleFinish()
            : () => setStep((current) => current + 1)
        }
        style={{
          background: 'var(--lx-accent)',
          color: '#0d1117',
          border: 'none',
          fontFamily: 'var(--lx-font-mono)',
          fontSize: 13,
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {isLast ? (saving ? 'saving…' : 'finish') : 'continue'}
        {!isLast && <ArrowRight size={13} strokeWidth={2} />}
      </Button>
    </div>
  )

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--lx-bg)',
        padding: '60px 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {step === 0 && (
        <OnboardingShell step={0}>
          <div>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                color: 'var(--lx-text)',
              }}
            >
              pick what to show
            </h1>
            <p
              style={{
                margin: '8px 0 0',
                fontFamily: 'var(--lx-font-sans)',
                fontSize: 14,
                color: 'var(--lx-text-2)',
                lineHeight: 1.55,
              }}
            >
              import your public repos from GitHub. pin up to 3 for the top of
              your profile. you can skip this and come back later.
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontFamily: 'var(--lx-font-mono)',
              fontSize: 11.5,
              color: 'var(--lx-text-3)',
            }}
          >
            <span>{state.selectedRepoFullNames.length} selected</span>
            <span style={{ color: 'var(--lx-accent)' }}>
              {state.pinnedRepoFullNames.length}/3 pinned
            </span>
          </div>

          <div
            style={{
              border: '1px solid var(--lx-border)',
              borderRadius: 4,
              background: 'var(--lx-bg)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid var(--lx-border)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'var(--lx-surface-alt)',
              }}
            >
              <Search
                size={13}
                strokeWidth={1.4}
                style={{ color: 'var(--lx-text-3)' }}
              />
              <input
                value={repoFilter}
                onChange={(event) => setRepoFilter(event.target.value)}
                placeholder="filter repos…"
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  fontFamily: 'var(--lx-font-mono)',
                  fontSize: 12,
                  color: 'var(--lx-text)',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--lx-font-mono)',
                  fontSize: 11,
                  color: 'var(--lx-text-3)',
                }}
              >
                {repoLoading ? 'loading…' : `${availableRepos.length} public`}
              </span>
            </div>

            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {repoError && (
                <div
                  style={{
                    padding: '18px 16px',
                    fontFamily: 'var(--lx-font-sans)',
                    fontSize: 13,
                    color: 'var(--lx-text-2)',
                    lineHeight: 1.6,
                  }}
                >
                  {repoError}
                </div>
              )}

              {!repoError && repoLoading && (
                <div
                  style={{
                    padding: '18px 16px',
                    fontFamily: 'var(--lx-font-mono)',
                    fontSize: 12,
                    color: 'var(--lx-text-3)',
                  }}
                >
                  loading repositories…
                </div>
              )}

              {!repoError && !repoLoading && filteredRepos.length === 0 && (
                <div
                  style={{
                    padding: '18px 16px',
                    fontFamily: 'var(--lx-font-sans)',
                    fontSize: 13,
                    color: 'var(--lx-text-2)',
                  }}
                >
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
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '12px 14px',
                        borderTop:
                          index > 0 ? '1px solid var(--lx-border)' : 'none',
                        background: isSelected
                          ? 'oklch(72% 0.17 185 / 0.04)'
                          : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 3,
                          flexShrink: 0,
                          border: isSelected
                            ? 'none'
                            : '1.5px solid var(--lx-border-strong)',
                          background: isSelected
                            ? 'var(--lx-accent)'
                            : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {isSelected && (
                          <Check
                            size={11}
                            strokeWidth={2.4}
                            style={{ color: '#0d1117' }}
                          />
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            marginBottom: 3,
                            flexWrap: 'wrap',
                          }}
                        >
                          <span
                            style={{
                              fontFamily: 'var(--lx-font-mono)',
                              fontSize: 13,
                              fontWeight: 600,
                              color: 'var(--lx-text)',
                            }}
                          >
                            {repository.fullName}
                          </span>
                          {repository.primaryLanguage && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontFamily: 'var(--lx-font-mono)',
                                fontSize: 10.5,
                                padding: '2px 6px',
                                borderRadius: 2,
                                background: 'var(--lx-surface-alt)',
                                color: 'var(--lx-text-2)',
                                border: '1px solid var(--lx-border)',
                                lineHeight: 1,
                              }}
                            >
                              <LangDot
                                lang={repository.primaryLanguage}
                                size={6}
                              />
                              {repository.primaryLanguage}
                            </span>
                          )}
                          <span
                            style={{
                              fontFamily: 'var(--lx-font-mono)',
                              fontSize: 11,
                              color: 'var(--lx-text-3)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                          >
                            <Star size={10} strokeWidth={1.4} />
                            {repository.stargazersCount.toLocaleString()}
                          </span>
                        </div>
                        <div
                          style={{
                            fontFamily: 'var(--lx-font-sans)',
                            fontSize: 12.5,
                            color: 'var(--lx-text-2)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {repository.description || 'no description provided'}
                        </div>
                      </div>

                      {isSelected && (
                        <button
                          onClick={(event) => {
                            event.stopPropagation()
                            togglePin(repository.fullName)
                          }}
                          style={{
                            border:
                              '1px solid ' +
                              (isPinned
                                ? 'oklch(72% 0.17 185 / 0.4)'
                                : 'var(--lx-border)'),
                            background: isPinned
                              ? 'oklch(72% 0.17 185 / 0.1)'
                              : 'transparent',
                            color: isPinned
                              ? 'var(--lx-accent)'
                              : 'var(--lx-text-3)',
                            padding: '5px 10px',
                            borderRadius: 3,
                            cursor: 'pointer',
                            fontFamily: 'var(--lx-font-mono)',
                            fontSize: 10.5,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
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
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                color: 'var(--lx-text)',
              }}
            >
              your profile
            </h1>
            <p
              style={{
                margin: '8px 0 0',
                fontFamily: 'var(--lx-font-sans)',
                fontSize: 14,
                color: 'var(--lx-text-2)',
                lineHeight: 1.55,
              }}
            >
              how other builders will see you.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label
                style={{
                  fontFamily: 'var(--lx-font-mono)',
                  fontSize: 11.5,
                  color: 'var(--lx-text-2)',
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                display name
              </label>
              <Input
                value={state.displayName}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    displayName: event.target.value,
                  }))
                }
                placeholder="how you want to appear"
                style={{
                  fontFamily: 'var(--lx-font-mono)',
                  background: 'var(--lx-bg)',
                  borderColor: 'var(--lx-border)',
                  color: 'var(--lx-text)',
                }}
              />
            </div>

            <div>
              <label
                style={{
                  fontFamily: 'var(--lx-font-mono)',
                  fontSize: 11.5,
                  color: 'var(--lx-text-2)',
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                city
              </label>
              <Input
                value={citySearch}
                onChange={(event) => setCitySearch(event.target.value)}
                placeholder={selectedCityName ?? 'search for your city'}
                style={{
                  fontFamily: 'var(--lx-font-mono)',
                  background: 'var(--lx-bg)',
                  borderColor: 'var(--lx-border)',
                  color: 'var(--lx-text)',
                }}
              />
              {selectedCityName && (
                <div
                  style={{
                    marginTop: 8,
                    fontFamily: 'var(--lx-font-mono)',
                    fontSize: 11,
                    color: 'var(--lx-text-3)',
                  }}
                >
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
                    style={{
                      width: '100%',
                      marginTop: 8,
                      border: '1px dashed var(--lx-border)',
                      background: 'transparent',
                      borderRadius: 4,
                      padding: '8px 10px',
                      textAlign: 'left',
                      fontFamily: 'var(--lx-font-mono)',
                      fontSize: 11.5,
                      color: 'var(--lx-text-2)',
                      cursor: 'pointer',
                    }}
                    type="button"
                  >
                    {city.displayName}
                  </button>
                ))}
            </div>

            <div>
              <label
                style={{
                  fontFamily: 'var(--lx-font-mono)',
                  fontSize: 11.5,
                  color: 'var(--lx-text-2)',
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                one-line bio{' '}
                <span style={{ color: 'var(--lx-text-3)' }}>
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
                style={{
                  fontFamily: 'var(--lx-font-sans)',
                  background: 'var(--lx-bg)',
                  borderColor: 'var(--lx-border)',
                  color: 'var(--lx-text)',
                  resize: 'none',
                }}
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
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                color: 'var(--lx-text)',
              }}
            >
              what are you up to?
            </h1>
            <p
              style={{
                margin: '8px 0 0',
                fontFamily: 'var(--lx-font-sans)',
                fontSize: 14,
                color: 'var(--lx-text-2)',
                lineHeight: 1.55,
              }}
            >
              this shows on your profile and project cards. change it whenever.
            </p>
          </div>

          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}
          >
            {(
              Object.entries(BUILD_STATUS) as Array<
                [BuildStatus, (typeof BUILD_STATUS)[BuildStatus]]
              >
            ).map(([id, meta]) => {
              const isSelected = state.buildStatus === id
              const hue = 'hue' in meta ? meta.hue : 200

              return (
                <button
                  key={id}
                  onClick={() =>
                    setState((current) => ({ ...current, buildStatus: id }))
                  }
                  style={{
                    padding: '14px 16px',
                    border:
                      '1px solid ' +
                      (isSelected
                        ? `hsl(${hue} 60% 50% / 0.5)`
                        : 'var(--lx-border)'),
                    background: isSelected
                      ? `hsl(${hue} 60% 50% / 0.05)`
                      : 'var(--lx-bg)',
                    borderRadius: 4,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    textAlign: 'left',
                  }}
                  type="button"
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <StatusPill status={id} size="md" />
                    <div
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        flexShrink: 0,
                        border: isSelected
                          ? 'none'
                          : '1.5px solid var(--lx-border-strong)',
                        background: isSelected
                          ? `hsl(${hue} 70% 60%)`
                          : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {isSelected && (
                        <div
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: 'var(--lx-bg)',
                          }}
                        />
                      )}
                    </div>
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
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                color: 'var(--lx-text)',
              }}
            >
              social links
            </h1>
            <p
              style={{
                margin: '8px 0 0',
                fontFamily: 'var(--lx-font-sans)',
                fontSize: 14,
                color: 'var(--lx-text-2)',
                lineHeight: 1.55,
              }}
            >
              all optional. these show on your profile.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                <label
                  style={{
                    fontFamily: 'var(--lx-font-mono)',
                    fontSize: 11.5,
                    color: 'var(--lx-text-2)',
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  {label}
                </label>
                <Input
                  value={state[key]}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                  placeholder={placeholder}
                  style={{
                    fontFamily: 'var(--lx-font-mono)',
                    background: 'var(--lx-bg)',
                    borderColor: 'var(--lx-border)',
                    color: 'var(--lx-text)',
                  }}
                />
              </div>
            ))}
          </div>

          {navButtons(true)}
        </OnboardingShell>
      )}

      {step === 4 && (
        <OnboardingShell step={4}>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'oklch(72% 0.17 185 / 0.15)',
                border: '1px solid var(--lx-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}
            >
              <Check size={24} style={{ color: 'var(--lx-accent)' }} />
            </div>
            <h1
              style={{
                margin: '0 0 12px',
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                color: 'var(--lx-text)',
              }}
            >
              you&apos;re all set.
            </h1>
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--lx-font-sans)',
                fontSize: 14,
                color: 'var(--lx-text-2)',
                lineHeight: 1.6,
                maxWidth: 420,
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
              we&apos;ll finish importing your selected repos, save your city,
              and build your first profile view.
            </p>
            <div
              style={{
                marginTop: 20,
                display: 'inline-flex',
                flexDirection: 'column',
                gap: 6,
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 11.5,
                color: 'var(--lx-text-3)',
              }}
            >
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
