// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { ConvexError } from 'convex/values'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ViewerBootstrapPayload } from '@/features/contracts'
import { NO_CITY_EXPLANATION } from '@/features/onboarding/components/city-step'
import type { OnboardingBuilderSuggestion } from '@/features/onboarding/queries'

type QueryOptions = { queryKey: [string, string, unknown] }

const mocks = vi.hoisted(() => ({
  completeOnboarding: vi.fn(),
  follow: vi.fn(),
  importRepositories: vi.fn(),
  listRepositories: vi.fn(),
  navigate: vi.fn(),
  refetchOwnedProjects: vi.fn(),
  reportActionError: vi.fn(),
  suggestions: [] as unknown[],
  unfollow: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute:
    () =>
    <TOptions,>(options: TOptions) => ({
      options,
      useNavigate: () => mocks.navigate,
      useSearch: () => ({}),
    }),
  redirect: vi.fn(),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: ({ queryKey: [, functionName, args] }: QueryOptions) => {
    switch (functionName) {
      case 'users:viewerBootstrap':
        return { data: bootstrap }
      case 'users:suggestOnboardingBuilders':
        return { data: args === 'skip' ? undefined : mocks.suggestions }
      case 'cities:search':
        return { data: [berlin] }
      case 'projects:listMine':
        return { data: [], refetch: mocks.refetchOwnedProjects }
      default:
        return { data: undefined }
    }
  },
}))

vi.mock('@/features/onboarding/mutations', () => ({
  useCompleteOnboarding: () => mocks.completeOnboarding,
}))

vi.mock('@/features/github/actions', () => ({
  useImportSelectedRepositories: () => mocks.importRepositories,
  useListGithubRepositories: () => mocks.listRepositories,
}))

vi.mock('@/features/follows/mutations', () => ({
  useFollowUser: () => mocks.follow,
  useUnfollowUser: () => mocks.unfollow,
}))

vi.mock('@/lib/action-error', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/action-error')>()),
  reportActionError: mocks.reportActionError,
}))

const berlin = {
  _id: 'city_berlin',
  displayName: 'Berlin, Germany',
  name: 'Berlin',
}

const bootstrap = {
  isAuthenticated: true,
  needsOnboarding: true,
  status: 'ready',
  viewer: {
    _id: 'user_viewer',
    appearInExplore: true,
    exploreConfig: { cityIds: [], stackPrefs: [] },
    github: { username: 'newbie' },
    notificationPrefs: {},
    onboardingCompletedAt: null,
    onboardingSelectedOwnedProjectIds: [],
    pinnedProfileProjectIds: [],
    privacy: {},
    profile: {
      avatarUrl: '',
      bio: '',
      buildStatus: 'just_exploring',
      cityId: null,
      displayName: 'New Builder',
      socialLinks: {},
    },
    stats: {},
    unreadMessagesCount: 0,
  },
} as unknown as ViewerBootstrapPayload

const repositories = [
  {
    description: 'first repo',
    fullName: 'newbie/one',
    githubUrl: 'https://github.com/newbie/one',
    lastCommitAt: 1,
    name: 'one',
    primaryLanguage: 'TypeScript',
    projectUrl: null,
    repoId: 1,
    stargazersCount: 3,
    topics: [],
  },
]

function suggestion(
  username: string,
  displayName: string,
): OnboardingBuilderSuggestion {
  return {
    avatarUrl: null,
    buildStatus: 'building_solo',
    displayName,
    githubUsername: username,
    location: {
      kind: 'city',
      cityId: berlin._id,
      cityName: berlin.displayName,
      regionLabel: 'Germany',
    },
    projectsCount: 2,
    userId: `user_${username}`,
    viewerIsFollowing: false,
  } as unknown as OnboardingBuilderSuggestion
}

async function renderOnboarding() {
  const { Route } = await import('@/routes/onboarding')
  const OnboardingPage = Route.options.component as () => ReactNode

  render(
    <QueryClientProvider client={new QueryClient()}>
      <OnboardingPage />
    </QueryClientProvider>,
  )

  return userEvent.setup()
}

/** Presses Tab until the focused element has the given accessible name. */
async function tabTo(user: UserEvent, name: string | RegExp, limit = 25) {
  for (let presses = 0; presses < limit; presses += 1) {
    await user.tab()
    const active = document.activeElement as HTMLElement | null
    const label =
      active?.getAttribute('aria-label') ?? active?.textContent?.trim() ?? ''
    if (typeof name === 'string' ? label === name : name.test(label)) {
      return active as HTMLElement
    }
  }
  throw new Error(`Tab never reached ${String(name)}`)
}

function expectHeadingFocused(name: string | RegExp) {
  const heading = screen.getByRole('heading', { level: 1, name })
  expect(heading.getAttribute('tabindex')).toBe('-1')
  expect(document.activeElement).toBe(heading)
}

/** City → status → profile → repos by the quickest mouse path. */
async function goToRepoStep(user: UserEvent) {
  await user.type(screen.getByRole('combobox', { name: 'city' }), 'ber')
  await user.click(await screen.findByRole('option', { name: /Berlin/ }))
  await user.click(screen.getByRole('button', { name: /continue/ }))
  await user.click(screen.getByRole('button', { name: 'skip for now' }))
  await user.click(screen.getByRole('button', { name: 'skip for now' }))
  await screen.findByRole('heading', { level: 1, name: 'pick what to show' })
}

describe('onboarding', () => {
  afterEach(() => {
    mocks.suggestions = []
  })

  function setUpServer() {
    mocks.listRepositories.mockResolvedValue(repositories)
    mocks.refetchOwnedProjects.mockResolvedValue({ data: [] })
    mocks.completeOnboarding.mockResolvedValue(null)
    mocks.importRepositories.mockResolvedValue(null)
  }

  it('completes with the keyboard only, through the city, skips and repo toggles', async () => {
    setUpServer()
    const user = await renderOnboarding()

    // City: type, pick the active option with Enter, continue with Enter.
    await tabTo(user, 'city')
    await user.keyboard('ber')
    await screen.findByRole('option', { name: /Berlin/ })
    await user.keyboard('{Enter}')
    expect(screen.getByText('selected: Berlin, Germany')).toBeTruthy()
    await tabTo(user, /^continue/)
    await user.keyboard('{Enter}')
    expectHeadingFocused('what are you up to?')

    // Status: a native radio chosen with Space, then continue.
    await user.tab()
    await user.keyboard(' ')
    expect(
      (screen.getAllByRole('radio') as HTMLInputElement[]).some(
        (radio) => radio.checked,
      ),
    ).toBe(true)
    await tabTo(user, /^continue/)
    await user.keyboard('{Enter}')
    expectHeadingFocused('your profile')

    // Profile: skipped with Space.
    await tabTo(user, 'skip for now')
    await user.keyboard(' ')
    expectHeadingFocused('pick what to show')

    // Repos: the row is a toggle button reachable by Tab.
    const repoRow = await tabTo(user, /newbie\/one/)
    expect(repoRow.getAttribute('aria-pressed')).toBe('false')
    await user.keyboard(' ')
    expect(repoRow.getAttribute('aria-pressed')).toBe('true')
    await user.keyboard('{Enter}')
    expect(repoRow.getAttribute('aria-pressed')).toBe('false')
    await user.keyboard(' ')
    expect(repoRow.getAttribute('aria-pressed')).toBe('true')

    // No builders in the city: the repo step is the last one.
    await tabTo(user, 'finish')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(mocks.completeOnboarding).toHaveBeenCalled())
    expect(mocks.importRepositories).toHaveBeenCalledWith({
      fullNames: ['newbie/one'],
    })
    const args = mocks.completeOnboarding.mock.calls[0][0]
    expect(args).toMatchObject({
      bio: '',
      cityId: 'city_berlin',
      displayName: 'New Builder',
      exploreCityIds: ['city_berlin'],
    })
    expect(args.buildStatus).toBeTruthy()
    expect(args).not.toHaveProperty('socialLinks')
    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith(
        expect.objectContaining({ to: '/explore' }),
      ),
    )
  })

  it('explains a disabled continue and offers a no-city path', async () => {
    setUpServer()
    const user = await renderOnboarding()

    const continueButton = screen.getByRole('button', { name: /continue/ })
    expect((continueButton as HTMLButtonElement).disabled).toBe(true)
    const reason = screen.getByText(
      "choose your city, or pick “can't find my city”.",
    )
    expect(continueButton.getAttribute('aria-describedby')).toBe(reason.id)

    const noCity = screen.getByRole('button', { name: "can't find my city" })
    await user.click(noCity)
    expect(noCity.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(NO_CITY_EXPLANATION)).toBeTruthy()
    expect((continueButton as HTMLButtonElement).disabled).toBe(false)
    expect(
      screen.queryByText("choose your city, or pick “can't find my city”."),
    ).toBeNull()

    await user.click(continueButton)
    expectHeadingFocused('what are you up to?')
    expect(screen.getByText('pick a status, or skip for now.')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'skip for now' }))
    await user.click(screen.getByRole('button', { name: 'skip for now' }))
    expect(screen.getByText('select a repo, or skip for now.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'skip for now' }))

    await waitFor(() => expect(mocks.completeOnboarding).toHaveBeenCalled())
    const args = mocks.completeOnboarding.mock.calls[0][0]
    expect(args).toMatchObject({ cityId: null, exploreCityIds: [] })
    expect(args).not.toHaveProperty('buildStatus')
    expect(mocks.importRepositories).not.toHaveBeenCalled()
  })

  it('keeps answers and shows the reason inline when finishing fails', async () => {
    setUpServer()
    mocks.completeOnboarding.mockRejectedValueOnce(
      new ConvexError('City not found'),
    )
    const user = await renderOnboarding()
    await goToRepoStep(user)

    await user.click(screen.getByRole('button', { name: 'skip for now' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'city not found',
    )
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(
      screen.getByRole('heading', { level: 1, name: 'pick what to show' }),
    ).toBeTruthy()
  })

  it('skips the follow step silently when the city has no other builders', async () => {
    setUpServer()
    mocks.suggestions = []
    const user = await renderOnboarding()
    await goToRepoStep(user)

    expect(screen.getByText('step 4 of 4')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /continue/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'skip for now' }))

    await waitFor(() => expect(mocks.completeOnboarding).toHaveBeenCalled())
    expect(screen.queryByRole('heading', { name: /builders in/ })).toBeNull()
    expect(mocks.follow).not.toHaveBeenCalled()
  })

  it('offers two builders with follow buttons and a skip, and follows only on click', async () => {
    setUpServer()
    mocks.suggestions = [suggestion('alice', 'Alice'), suggestion('bob', 'Bob')]
    const user = await renderOnboarding()
    await goToRepoStep(user)

    expect(screen.getByText('step 4 of 5')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'skip for now' }))
    expectHeadingFocused('builders in Berlin, Germany')

    const list = screen.getByRole('list')
    const followButtons = within(list).getAllByRole('button', {
      name: /^follow /,
    })
    expect(followButtons).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'skip' })).toBeTruthy()
    expect(mocks.follow).not.toHaveBeenCalled()

    mocks.follow.mockResolvedValueOnce(null)
    const followAlice = screen.getByRole('button', { name: 'follow Alice' })
    await user.click(followAlice)
    expect(mocks.follow).toHaveBeenCalledTimes(1)
    expect(mocks.follow).toHaveBeenCalledWith({ targetUserId: 'user_alice' })
    await waitFor(() =>
      expect(followAlice.getAttribute('aria-pressed')).toBe('true'),
    )

    await user.click(screen.getByRole('button', { name: 'skip' }))
    await waitFor(() => expect(mocks.completeOnboarding).toHaveBeenCalled())
    expect(mocks.follow).toHaveBeenCalledTimes(1)
  })

  it('reports a failed follow and leaves the builder unfollowed', async () => {
    setUpServer()
    mocks.suggestions = [suggestion('alice', 'Alice')]
    const user = await renderOnboarding()
    await goToRepoStep(user)
    await user.click(screen.getByRole('button', { name: 'skip for now' }))

    const error = new Error('network down')
    mocks.follow.mockRejectedValueOnce(error)
    const followAlice = screen.getByRole('button', { name: 'follow Alice' })
    await user.click(followAlice)

    await waitFor(() =>
      expect(mocks.reportActionError).toHaveBeenCalledWith(error, {
        title: "couldn't follow",
      }),
    )
    expect(followAlice.getAttribute('aria-pressed')).toBe('false')
    expect(mocks.completeOnboarding).not.toHaveBeenCalled()
  })
})
