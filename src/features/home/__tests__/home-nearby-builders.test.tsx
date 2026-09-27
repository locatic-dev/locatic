// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Id } from '../../../../convex/_generated/dataModel'
import type { HomeNearbyBuilder } from '../queries'

const { followUser, showUndoToast, unfollowUser } = vi.hoisted(() => ({
  followUser: vi.fn(),
  showUndoToast: vi.fn(),
  unfollowUser: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    search: _search,
    preload: _preload,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode
    params?: Record<string, string>
    preload?: string
    search?: unknown
    to: string
  }) => (
    <a
      href={to.replace(
        /\$(\w+)/g,
        (_match, key: string) => params?.[key] ?? '',
      )}
      {...props}
    >
      {children}
    </a>
  ),
}))

vi.mock('@/features/follows/mutations', () => ({
  useFollowUser: () => followUser,
  useUnfollowUser: () => unfollowUser,
}))

vi.mock('@/lib/undo-toast', () => ({ showUndoToast }))

import { HomeNearbyBuilders } from '../home-nearby-builders'

const builder: HomeNearbyBuilder = {
  userId: 'user_mira' as Id<'users'>,
  displayName: 'Mira',
  avatarUrl: null,
  githubUsername: 'mira',
  buildStatus: 'building_solo',
  location: {
    kind: 'city',
    cityId: 'city_blr' as Id<'cities'>,
    cityName: 'Bengaluru, Karnataka, India',
    regionLabel: 'Karnataka, India',
  },
  projectsCount: 2,
  isNewBuilder: false,
  viewerIsFollowing: false,
}

describe('HomeNearbyBuilders', () => {
  beforeEach(() => {
    followUser.mockReset().mockResolvedValue(null)
    unfollowUser.mockReset().mockResolvedValue(null)
    showUndoToast.mockReset()
  })

  it('links each builder and their city, and follows with an undo', async () => {
    render(<HomeNearbyBuilders builders={[builder]} />)

    expect(
      screen
        .getByRole('link', { name: "Open Mira's profile" })
        .getAttribute('href'),
    ).toBe('/u/mira')
    expect(
      screen
        .getByRole('link', { name: 'Bengaluru, Karnataka, India' })
        .getAttribute('href'),
    ).toBe('/c/city_blr')

    const toggle = screen.getByRole('button', { name: 'follow Mira' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle)

    await waitFor(() =>
      expect(toggle.getAttribute('aria-pressed')).toBe('true'),
    )
    // The accessible name contains the visible label in both states.
    expect(toggle.getAttribute('aria-label')).toBe('following Mira')
    expect(toggle.textContent).toBe('following')
    expect(followUser).toHaveBeenCalledWith({ targetUserId: 'user_mira' })
    expect(showUndoToast).toHaveBeenCalledTimes(1)
    const [{ message, undo }] = showUndoToast.mock.calls[0] as [
      { message: string; undo: () => Promise<unknown> },
    ]
    expect(message).toBe('following @mira')

    await undo()
    expect(unfollowUser).toHaveBeenCalledWith({ targetUserId: 'user_mira' })
    await waitFor(() =>
      expect(toggle.getAttribute('aria-pressed')).toBe('false'),
    )
  })
})
