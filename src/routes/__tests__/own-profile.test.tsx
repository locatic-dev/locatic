// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { ConvexError } from 'convex/values'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const toastError = vi.fn()
  return {
    signOut: vi.fn(),
    pinOwnedProject: vi.fn(),
    refreshProjectMetadata: vi.fn(),
    showcase: null as unknown,
    toast: Object.assign(vi.fn(), { error: toastError }),
    toastError,
  }
})

vi.mock('sonner', () => ({ toast: mocks.toast }))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute:
    () =>
    <TOptions,>(options: TOptions) => ({
      options,
      useNavigate: () => vi.fn(),
      useSearch: () => ({ tab: 'projects', network: 'followers' }),
    }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useRouter: () => ({ navigate: vi.fn() }),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: (options: { queryKey: unknown[] }) =>
    String(options.queryKey[1]).includes('publicProfileOverview')
      ? { data: mocks.showcase, isLoading: false }
      : { data: undefined, isLoading: false },
  useSuspenseQuery: () => ({ data: privateOverview }),
}))

vi.mock('@/integrations/clerk/sign-out', () => ({
  useSignOut: () => mocks.signOut,
}))

vi.mock('convex/react', () => ({
  useAction: () => vi.fn().mockResolvedValue(null),
}))

vi.mock('@/features/projects/mutations', () => ({
  usePinOwnedProject: () => mocks.pinOwnedProject,
  useRefreshProjectMetadata: () => mocks.refreshProjectMetadata,
}))

vi.mock('@/features/github/repository-manager-dialog', () => ({
  RepositoryManagerDialog: ({ buttonLabel }: { buttonLabel: string }) => (
    <button type="button">{buttonLabel}</button>
  ),
}))

vi.mock('@/features/projects/reactions/project-reaction-bar', () => ({
  ProjectReactionBar: () => null,
}))

vi.mock('@/features/projects/reactions/reaction-bar', () => ({
  ReactionBar: () => null,
}))

const privateOverview = {
  cityName: 'Bengaluru, Karnataka, India',
  viewer: {
    _id: 'user_ada',
    appearInExplore: true,
    github: { id: 1, username: 'ada' },
    profile: {
      displayName: 'Ada',
      fullName: null,
      avatarUrl: '',
      bio: 'maps and compilers',
      cityId: 'city_blr',
      buildStatus: 'open_to_collab',
      primaryLanguages: [],
      socialLinks: {},
    },
    stats: {
      followersCount: 1,
      followingCount: 2,
      projectsCount: 1,
      postsCount: 0,
      contributionsCount: 0,
      commentsCount: 0,
      likedCount: 0,
    },
    exploreConfig: { cityIds: [], stackPrefs: [] },
    privacy: {},
    notificationPrefs: {},
    onboardingSelectedOwnedProjectIds: [],
    pinnedProfileProjectIds: ['project_tiles'],
    unreadMessagesCount: 0,
    onboardingCompletedAt: 1,
    githubContributions: {
      totalContributions: 5,
      syncedAt: Date.now(),
      weeks: [{ days: [{ count: 5, date: '2026-09-01' }] }],
    },
  },
}

function project(name: string) {
  return {
    projectId: `project_${name}`,
    ownerUserId: 'user_ada',
    fullName: `ada/${name}`,
    owner: 'ada',
    repo: name,
    description: null,
    primaryLanguage: 'Go',
    languages: [{ name: 'Go', bytes: 10 }],
    githubStars: 0,
    locaticLikes: 0,
    reactionCounts: {},
    commentsCount: 0,
    postsCount: 0,
    topics: [],
    lastCommitAt: Date.UTC(2026, 8, 1),
    updatedAt: Date.UTC(2026, 8, 1),
    authorName: 'Ada',
    authorHandle: 'ada',
    authorAvatarUrl: null,
    cityLabel: 'Bengaluru, Karnataka, India',
    cityVisibilityState: 'exact_city',
  }
}

function showcase(
  pinned: string[],
  recent: Array<ReturnType<typeof project>> = [project('atlas')],
) {
  return {
    profile: {
      location: {
        kind: 'city',
        cityId: 'city_blr',
        cityName: 'Bengaluru, Karnataka, India',
        regionLabel: 'Karnataka, India',
      },
    },
    pinnedProjects: pinned.map(project),
    recentProjects: recent,
    recentPosts: [],
  }
}

async function renderOwnProfile(
  pinned: string[],
  recent?: Array<ReturnType<typeof project>>,
) {
  mocks.showcase = showcase(pinned, recent)
  const { Route } = await import('@/routes/_app/profile')
  const ProfilePage = Route.options.component as () => ReactNode

  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProfilePage />
    </QueryClientProvider>,
  )
}

type ToastOptions = { action?: { label: string; onClick: () => void } }

describe('own profile page', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('mirrors the public section order', async () => {
    await renderOwnProfile(['tiles'])

    expect(screen.getByRole('heading', { level: 1, name: 'Ada' })).toBeTruthy()
    const sections = [
      ...document.querySelectorAll('section[aria-labelledby]'),
    ].map(
      (section) =>
        document.getElementById(section.getAttribute('aria-labelledby') ?? '')
          ?.textContent,
    )
    expect(sections).toEqual([
      'pinned',
      'recent work',
      'github contributions',
      'languages',
      'network',
      'all activity',
    ])
  })

  it('prompts the owner to pin when nothing is pinned', async () => {
    await renderOwnProfile([])

    expect(screen.getByRole('heading', { name: 'pinned' })).toBeTruthy()
    expect(
      screen.getByText('pin up to three projects so visitors see them first.'),
    ).toBeTruthy()
  })

  it('offers undo after an unpin and reports the pin cap if the re-pin fails', async () => {
    mocks.pinOwnedProject
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(
        new ConvexError('You can pin at most three projects'),
      )
    await renderOwnProfile(['tiles'])

    fireEvent.click(screen.getByRole('button', { name: 'pinned tiles, unpin' }))

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1))
    expect(mocks.pinOwnedProject).toHaveBeenCalledWith({
      pinned: false,
      projectId: 'project_tiles',
    })
    const [message, options] = mocks.toast.mock.calls[0] as [
      string,
      ToastOptions,
    ]
    expect(message).toBe('unpinned tiles')

    options.action?.onClick()

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "couldn't undo",
        expect.objectContaining({
          description: 'you can pin up to three projects. unpin one first.',
        }),
      ),
    )
    expect(mocks.pinOwnedProject).toHaveBeenLastCalledWith({
      pinned: true,
      projectId: 'project_tiles',
    })
  })

  it('lets the owner retry a failed GitHub refresh from their project card', async () => {
    mocks.refreshProjectMetadata.mockResolvedValueOnce(null)
    await renderOwnProfile(
      [],
      [
        {
          ...project('atlas'),
          syncStatus: {
            kind: 'failed',
            at: null,
            hasReadme: false,
            error: 'GitHub returned 502',
          },
        } as ReturnType<typeof project>,
      ],
    )

    expect(
      screen.getByText('last refresh failed: GitHub returned 502'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))

    await waitFor(() =>
      expect(mocks.refreshProjectMetadata).toHaveBeenCalledWith({
        projectId: 'project_atlas',
      }),
    )
  })
})

it('wires the mobile profile sign-out button to the shared action', async () => {
  await renderOwnProfile([])
  fireEvent.click(screen.getByRole('button', { name: 'sign out' }))
  expect(mocks.signOut).toHaveBeenCalledOnce()
  cleanup()
})
