import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { useCompleteOnboarding } from '@/features/onboarding/mutations'
import { viewerQueryOptions } from '@/features/viewer/queries'
import { getAccountRecoveryState } from '@/features/viewer/lifecycle'
import { mineProjectsQueryOptions } from '@/features/projects/queries'
import {
  useListGithubRepositories,
  useImportSelectedRepositories,
} from '@/features/github/actions'
import {
  buildOwnedProjectIdsFromFullNames,
  deriveStackPrefsFromRepositories,
} from '@/features/onboarding/helpers'
import { onboardingBuilderSuggestionsQueryOptions } from '@/features/onboarding/queries'
import {
  getNextOnboardingStep,
  getOnboardingSteps,
  type OnboardingStep,
} from '@/features/onboarding/steps'
import {
  OnboardingShell,
  StepNav,
} from '@/features/onboarding/components/onboarding-shell'
import { CityStepFields } from '@/features/onboarding/components/city-step'
import {
  StatusStepFields,
  type OnboardingBuildStatus,
} from '@/features/onboarding/components/status-step'
import { ProfileStepFields } from '@/features/onboarding/components/profile-step'
import {
  RepoStepFields,
  type GithubRepository,
} from '@/features/onboarding/components/repo-step'
import { FollowStepFields } from '@/features/onboarding/components/follow-step'
import {
  mapViewerBootstrap,
  type ViewerBootstrapPayload,
} from '@/features/contracts'
import { getActionErrorMessage } from '@/lib/action-error'
import { validateAuthDestinationSearch } from '@/lib/safe-redirect'
import { getFreshExploreSearch } from '@/features/explore/state'
import { seo } from '@/lib/seo'

export const Route = createFileRoute('/onboarding')({
  validateSearch: validateAuthDestinationSearch,
  beforeLoad: async ({ context, search }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/sign-in/$',
        search: { redirect: search.redirect },
      })
    }

    const bootstrap = (await context.queryClient.ensureQueryData(
      viewerQueryOptions(),
    )) as ViewerBootstrapPayload

    if (getAccountRecoveryState(bootstrap)) {
      throw redirect({
        to: '/sign-in/$',
        search: { redirect: search.redirect },
      })
    }

    if (!bootstrap.needsOnboarding) {
      if (search.redirect) {
        throw redirect({ href: search.redirect })
      }

      throw redirect({ to: '/home' })
    }
  },
  head: () => seo({ title: 'welcome', noindex: true }),
  component: OnboardingPage,
})

type OnboardingAnswers = {
  bio: string
  buildStatus: OnboardingBuildStatus | ''
  displayName: string
  selectedRepoFullNames: string[]
}

function OnboardingPage() {
  const navigate = Route.useNavigate()
  const { redirect: destination } = Route.useSearch()
  const queryClient = useQueryClient()
  const completeOnboarding = useCompleteOnboarding()
  const listGithubRepositories = useListGithubRepositories()
  const importSelectedRepositories = useImportSelectedRepositories()

  const viewerQuery = useQuery(viewerQueryOptions())
  const bootstrap = mapViewerBootstrap(
    viewerQuery.data as ViewerBootstrapPayload | undefined,
  )
  const needsRecovery = Boolean(
    getAccountRecoveryState(
      viewerQuery.data as ViewerBootstrapPayload | undefined,
    ),
  )
  useEffect(() => {
    if (!needsRecovery) return
    void navigate({
      to: '/sign-in/$',
      search: { redirect: destination },
      replace: true,
    })
  }, [destination, navigate, needsRecovery])
  const ownedProjectsQuery = useQuery({
    ...mineProjectsQueryOptions(),
    enabled: Boolean(bootstrap?.viewer),
  })

  const [step, setStep] = useState<OnboardingStep>('city')
  const [selectedCityId, setSelectedCityId] = useState<Id<'cities'> | null>(
    null,
  )
  const [selectedCityName, setSelectedCityName] = useState<string | null>(null)
  const [noCity, setNoCity] = useState(false)
  const [saving, setSaving] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)
  const [repoLoading, setRepoLoading] = useState(true)
  const [repoError, setRepoError] = useState<string | null>(null)
  const [availableRepos, setAvailableRepos] = useState<GithubRepository[]>([])
  const [answers, setAnswers] = useState<OnboardingAnswers>({
    bio: '',
    buildStatus: '',
    displayName: '',
    selectedRepoFullNames: [],
  })

  const cityId = noCity ? null : selectedCityId
  const suggestionsQuery = useQuery(
    onboardingBuilderSuggestionsQueryOptions(cityId),
  )
  const builderSuggestions = cityId ? (suggestionsQuery.data ?? []) : []
  // Never shown empty: the follow step exists only when the chosen city
  // has at least one eligible builder; otherwise the repo step finishes.
  const steps = getOnboardingSteps(
    builderSuggestions.length > 0 || step === 'follow',
  )
  const stepIndex = Math.max(0, steps.indexOf(step))
  const isLastStep = stepIndex === steps.length - 1

  // Every step change moves focus to the new step's heading.
  const headingRef = useRef<HTMLHeadingElement>(null)
  const previousStepRef = useRef(step)
  useEffect(() => {
    if (previousStepRef.current === step) {
      return
    }

    previousStepRef.current = step
    headingRef.current?.focus()
  }, [step])

  useEffect(() => {
    if (needsRecovery) return
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
            'could not load your public GitHub repositories right now. skip for now and import them later from settings → connected accounts.',
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
  }, [listGithubRepositories, needsRecovery])

  useEffect(() => {
    if (!bootstrap?.viewer) {
      return
    }

    setAnswers((current) => {
      if (current.displayName.trim()) {
        return current
      }

      return {
        ...current,
        displayName: bootstrap.viewer?.displayName ?? '',
      }
    })

    if (!selectedCityId && bootstrap.viewer?.cityId) {
      setSelectedCityId(bootstrap.viewer.cityId)
      setSelectedCityName(bootstrap.viewer.cityName)
    }
  }, [bootstrap, selectedCityId])

  if (!bootstrap || needsRecovery) {
    return (
      <main id="main-content" tabIndex={-1} className="p-8 text-text-muted">
        loading…
      </main>
    )
  }

  const defaultDisplayName =
    bootstrap.viewer?.displayName ?? bootstrap.viewer?.githubUsername ?? ''
  const cityLabel = selectedCityName ?? 'your city'

  const toggleRepo = (fullName: string) => {
    setAnswers((current) => {
      const isSelected = current.selectedRepoFullNames.includes(fullName)
      return {
        ...current,
        selectedRepoFullNames: isSelected
          ? current.selectedRepoFullNames.filter((repo) => repo !== fullName)
          : [...current.selectedRepoFullNames, fullName],
      }
    })
  }

  const handleFinish = async (finalAnswers: OnboardingAnswers) => {
    if (!cityId && !noCity) {
      return
    }

    setSaving(true)
    setFinishError(null)

    try {
      if (finalAnswers.selectedRepoFullNames.length > 0) {
        await importSelectedRepositories({
          fullNames: finalAnswers.selectedRepoFullNames,
        })
      }

      const ownedProjectsResult = await ownedProjectsQuery.refetch()
      const ownedProjects =
        (ownedProjectsResult.data as Array<Doc<'projects'>> | undefined) ??
        (ownedProjectsQuery.data as Array<Doc<'projects'>> | undefined) ??
        []

      const selectedRepositories = availableRepos.filter((repository) =>
        finalAnswers.selectedRepoFullNames.includes(repository.fullName),
      )

      await completeOnboarding({
        bio: finalAnswers.bio.trim(),
        // A skipped status keeps the sign-up default on the server.
        ...(finalAnswers.buildStatus
          ? { buildStatus: finalAnswers.buildStatus }
          : {}),
        cityId,
        displayName: finalAnswers.displayName.trim() || defaultDisplayName,
        exploreCityIds: cityId ? [cityId] : [],
        onboardingSelectedOwnedProjectIds: buildOwnedProjectIdsFromFullNames(
          finalAnswers.selectedRepoFullNames,
          ownedProjects,
        ),
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

      // The chosen city was just saved as the explore default, so plain
      // `/explore` (default scope) already opens on it; with no city it
      // opens global discovery.
      if (destination) {
        void navigate({ href: destination })
      } else {
        void navigate({ to: '/explore', search: getFreshExploreSearch() })
      }
    } catch (error) {
      // Everything the user entered stays in state, so finishing again retries
      // with the same answers.
      setFinishError(getActionErrorMessage(error))
      setSaving(false)
    }
  }

  const advance = (nextAnswers: OnboardingAnswers = answers) => {
    const nextStep = getNextOnboardingStep(steps, step)
    if (nextStep) {
      setStep(nextStep)
      return
    }

    void handleFinish(nextAnswers)
  }

  const skip = (patch: Partial<OnboardingAnswers>) => {
    const nextAnswers = { ...answers, ...patch }
    setAnswers(nextAnswers)
    advance(nextAnswers)
  }

  const navProps = {
    error: isLastStep ? finishError : null,
    isLast: isLastStep,
    onBack:
      stepIndex > 0 ? () => setStep(steps[stepIndex - 1] ?? 'city') : undefined,
    saving,
  }
  const shellProps = { headingRef, stepIndex, totalSteps: steps.length }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-dvh flex-col items-center bg-canvas px-(--lx-gutter) py-8"
    >
      {step === 'city' && (
        <OnboardingShell
          {...shellProps}
          title="where do you build?"
          description="your city puts you on its builder list and city feed."
        >
          <CityStepFields
            noCity={noCity}
            onNoCityChange={setNoCity}
            onSelectCity={(city) => {
              setSelectedCityId(city._id)
              setSelectedCityName(city.displayName)
              setNoCity(false)
            }}
            selectedCityName={selectedCityName}
          />
          <StepNav
            {...navProps}
            disabledReason={
              cityId || noCity
                ? null
                : "choose your city, or pick “can't find my city”."
            }
            onContinue={() => advance()}
          />
        </OnboardingShell>
      )}

      {step === 'status' && (
        <OnboardingShell
          {...shellProps}
          title="what are you up to?"
          description="shows on your profile and project cards. optional: skip it and set it later in settings → account."
        >
          <StatusStepFields
            value={answers.buildStatus}
            onChange={(buildStatus) =>
              setAnswers((current) => ({ ...current, buildStatus }))
            }
          />
          <StepNav
            {...navProps}
            disabledReason={
              answers.buildStatus ? null : 'pick a status, or skip for now.'
            }
            onContinue={() => advance()}
            onSkip={() => skip({ buildStatus: '' })}
          />
        </OnboardingShell>
      )}

      {step === 'profile' && (
        <OnboardingShell
          {...shellProps}
          title="your profile"
          description="how other builders see you. optional: skip it and edit your name and bio later in settings → account."
        >
          <ProfileStepFields
            bio={answers.bio}
            displayName={answers.displayName}
            onBioChange={(bio) =>
              setAnswers((current) => ({ ...current, bio }))
            }
            onDisplayNameChange={(displayName) =>
              setAnswers((current) => ({ ...current, displayName }))
            }
          />
          <StepNav
            {...navProps}
            disabledReason={
              answers.displayName.trim()
                ? null
                : 'add a display name, or skip for now.'
            }
            onContinue={() => advance()}
            onSkip={() => skip({ bio: '', displayName: defaultDisplayName })}
          />
        </OnboardingShell>
      )}

      {step === 'repos' && (
        <OnboardingShell
          {...shellProps}
          title="pick what to show"
          description="choose public GitHub repos to bring into Locatic. optional: skip it and import later from settings → connected accounts → manage repositories."
        >
          <RepoStepFields
            error={repoError}
            loading={repoLoading}
            onToggle={toggleRepo}
            repositories={availableRepos}
            selectedFullNames={answers.selectedRepoFullNames}
          />
          <StepNav
            {...navProps}
            disabledReason={
              answers.selectedRepoFullNames.length > 0
                ? null
                : 'select a repo, or skip for now.'
            }
            onContinue={() => advance()}
            onSkip={() => skip({ selectedRepoFullNames: [] })}
          />
        </OnboardingShell>
      )}

      {step === 'follow' && (
        <OnboardingShell
          {...shellProps}
          title={`builders in ${cityLabel}`}
          description="follow anyone whose work you want on your home feed. optional: nobody is followed unless you press follow."
        >
          <FollowStepFields builders={builderSuggestions} />
          <StepNav
            {...navProps}
            onContinue={() => advance()}
            onSkip={() => advance()}
            skipLabel="skip"
          />
        </OnboardingShell>
      )}
    </main>
  )
}
