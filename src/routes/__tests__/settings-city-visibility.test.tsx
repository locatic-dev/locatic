// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { PrivateProfileOverviewPayload } from '@/features/contracts'

const mocks = vi.hoisted(() => ({
  updatePrivacy: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute:
    () =>
    <TOptions,>(options: TOptions) => ({
      options,
      useNavigate: () => vi.fn(),
      useSearch: () => ({ tab: 'privacy' }),
    }),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useBlocker: vi.fn(),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined }),
  useSuspenseQuery: () => ({ data: overview }),
}))

vi.mock('@/features/settings/mutations', () => ({
  useUpdateExploreConfig: () => vi.fn(),
  useUpdateNotificationPref: () => vi.fn(),
  useUpdateEmailPreference: () => vi.fn(),
  useUpdatePrivacy: () => mocks.updatePrivacy,
  useUpdateProfile: () => vi.fn(),
}))

vi.mock('@/features/settings/account-danger-zone', () => ({
  AccountDangerZone: () => null,
}))

vi.mock('@/features/github/repository-manager-dialog', () => ({
  RepositoryManagerDialog: () => null,
}))

const overview = {
  cityName: 'Berlin, Germany',
  regionLabel: 'Germany',
  viewer: {
    _id: 'user_1',
    appearInExplore: true,
    exploreConfig: { cityIds: [], stackPrefs: [] },
    github: { username: 'ada' },
    notificationPrefs: {},
    privacy: {
      cityVisibility: 'exact_city',
      commentHistoryVisibility: 'public',
      followGraphVisibility: 'public',
      likedProjectsVisibility: 'public',
      profileVisibility: 'public',
    },
    profile: {
      avatarUrl: '',
      bio: '',
      buildStatus: 'building',
      cityId: 'city_berlin',
      displayName: 'Ada',
      socialLinks: {},
    },
    stats: {},
  },
} as unknown as PrivateProfileOverviewPayload

describe('settings city visibility', () => {
  it('saves only the city visibility, never the rest of the privacy object from this render', async () => {
    mocks.updatePrivacy.mockResolvedValue(null)
    const { Route } = await import('@/routes/_app/settings')
    const SettingsPage = Route.options.component as ComponentType

    render(
      <QueryClientProvider client={new QueryClient()}>
        <SettingsPage />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'region only' }))

    await waitFor(() => expect(mocks.updatePrivacy).toHaveBeenCalledTimes(1))
    expect(mocks.updatePrivacy).toHaveBeenCalledWith({
      cityVisibility: 'region_only',
    })
  })
})
