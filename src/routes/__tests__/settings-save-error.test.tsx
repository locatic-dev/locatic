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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  useUpdateNotificationPref: () => vi.fn(),
  useUpdateEmailPreference: () => vi.fn(),
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
  beforeEach(() => {
    mocks.updateProfile.mockReset()
    overview.viewer.profile.socialLinks = {
      github: 'ada',
      x: null,
      linkedin: null,
      bluesky: null,
      website: 'https://example.com/',
    }
  })
  afterEach(cleanup)

  it('blocks a malformed website without clearing the stored link and keeps discard available', async () => {
    const { Route } = await import('@/routes/_app/settings')
    const SettingsPage = Route.options.component as () => ReactNode
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SettingsPage />
      </QueryClientProvider>,
    )
    const input = screen.getByLabelText('website') as HTMLInputElement
    expect(input.value).toBe('https://example.com/')
    fireEvent.change(input, { target: { value: 'not a valid website' } })
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('alert').textContent).toMatch(/valid.*URL/i)
    const save = screen.getByRole('button', {
      name: 'save changes',
    }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.click(save)
    expect(mocks.updateProfile).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'discard' }))
    expect(input.value).toBe('https://example.com/')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps invalid input dirty even when the stored website is blank, and allows intentional clearing', async () => {
    overview.viewer.profile.socialLinks = {
      github: 'ada',
      x: null,
      linkedin: null,
      bluesky: null,
      website: null,
    }
    const { Route } = await import('@/routes/_app/settings')
    const SettingsPage = Route.options.component as () => ReactNode
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SettingsPage />
      </QueryClientProvider>,
    )
    fireEvent.change(screen.getByLabelText('website'), {
      target: { value: 'not a valid website' },
    })
    expect(
      (
        screen.getByRole('button', {
          name: 'save changes',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    fireEvent.change(screen.getByLabelText('website'), {
      target: { value: '' },
    })
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.change(screen.getByLabelText('website'), {
      target: { value: 'example.com' },
    })
    expect(
      (
        screen.getByRole('button', {
          name: 'save changes',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
  })

  it('allows intentionally clearing a stored website', async () => {
    mocks.updateProfile.mockResolvedValueOnce(null)
    const { Route } = await import('@/routes/_app/settings')
    const SettingsPage = Route.options.component as () => ReactNode
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SettingsPage />
      </QueryClientProvider>,
    )
    fireEvent.change(screen.getByLabelText('website'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'save changes' }))
    await waitFor(() =>
      expect(mocks.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          socialLinks: expect.objectContaining({ website: null }),
        }),
      ),
    )
  })

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
