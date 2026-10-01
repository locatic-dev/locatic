// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConvexError } from 'convex/values'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { PrivateProfileOverviewPayload } from '@/features/contracts'

const mocks = vi.hoisted(() => ({
  updateProfile: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute:
    () =>
    <TOptions,>(options: TOptions) => ({
      options,
      useNavigate: () => vi.fn(),
      useSearch: () => ({ tab: 'account' }),
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
  useUpdateNotificationPrefs: () => vi.fn(),
  useUpdatePrivacy: () => vi.fn(),
  useUpdateProfile: () => mocks.updateProfile,
}))

vi.mock('@/features/settings/account-danger-zone', () => ({
  AccountDangerZone: () => null,
}))

vi.mock('@/features/github/repository-manager-dialog', () => ({
  RepositoryManagerDialog: () => null,
}))

const overview = {
  cityName: null,
  viewer: {
    _id: 'user_1',
    appearInExplore: true,
    github: { username: 'ada' },
    notificationPrefs: {},
    privacy: {},
    profile: {
      avatarUrl: '',
      bio: '',
      buildStatus: 'building',
      cityId: null,
      displayName: 'Ada',
      socialLinks: {},
    },
    stats: {},
  },
} as unknown as PrivateProfileOverviewPayload

describe('settings account save', () => {
  it('keeps the edited value and shows the reason when saving fails', async () => {
    mocks.updateProfile.mockRejectedValueOnce(
      new ConvexError('display name is too long'),
    )
    const { Route } = await import('@/routes/_app/settings')
    const SettingsPage = Route.options.component as () => ReactNode

    render(
      <QueryClientProvider client={new QueryClient()}>
        <SettingsPage />
      </QueryClientProvider>,
    )

    fireEvent.change(screen.getByLabelText('display name'), {
      target: { value: 'Ada Lovelace' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'save changes' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'display name is too long',
      ),
    )
    expect(mocks.updateProfile).toHaveBeenCalledTimes(1)
    expect(
      (screen.getByLabelText('display name') as HTMLInputElement).value,
    ).toBe('Ada Lovelace')
    expect(screen.getByRole('button', { name: 'save changes' })).toBeTruthy()
  })
})
