// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Id } from '../../../../convex/_generated/dataModel'

import { publicProfileOverviewQueryOptions } from '@/features/profile/queries'
import type { PublicProfileOverview } from '@/features/profile/types'
import { Route as PublicProfileRoute } from '@/routes/u.$username'
import { useProfileFollow } from '../use-profile-follow'

const mocks = vi.hoisted(() => ({
  followUser: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
  unfollowUser: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: mocks.toast }))

vi.mock('@/features/follows/mutations', () => ({
  useFollowUser: () => mocks.followUser,
  useUnfollowUser: () => mocks.unfollowUser,
}))

type ToastOptions = { action?: { label: string; onClick: () => void } }
type Target = { githubUsername: string; username: string; userId: string }

const ada: Target = { githubUsername: 'ada', username: 'ada', userId: 'u_ada' }
const bob: Target = { githubUsername: 'bob', username: 'bob', userId: 'u_bob' }

const overviewFor = (target: Target, followed: boolean) =>
  ({
    userId: target.userId,
    githubUsername: target.githubUsername,
    stats: { followersCount: 5, followingCount: 0 },
    viewerFollowsProfile: followed,
  }) as unknown as PublicProfileOverview

function setup() {
  const queryClient = new QueryClient()
  const keyFor = (target: Target) =>
    publicProfileOverviewQueryOptions(target.username).queryKey
  queryClient.setQueryData(keyFor(ada), overviewFor(ada, true))
  queryClient.setQueryData(keyFor(bob), overviewFor(bob, false))
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const hook = renderHook(
    (target: Target) =>
      useProfileFollow({
        ...target,
        userId: target.userId as Id<'users'>,
      }),
    { initialProps: ada, wrapper },
  )
  const cached = (target: Target) =>
    queryClient.getQueryData<PublicProfileOverview>(keyFor(target))

  return { ...hook, cached }
}

describe('useProfileFollow target', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('undo re-follows the original profile after navigating to another one', async () => {
    mocks.unfollowUser.mockResolvedValue(null)
    mocks.followUser.mockResolvedValue(null)
    const { cached, rerender, result } = setup()

    await act(() => result.current.toggleFollow(true))
    expect(mocks.unfollowUser).toHaveBeenCalledWith({ targetUserId: 'u_ada' })

    // The route component is reused: the same hook now renders Bob's profile.
    rerender(bob)

    const [message, options] = mocks.toast.mock.calls[0] as [
      string,
      ToastOptions,
    ]
    expect(message).toBe('unfollowed @ada')
    act(() => options.action?.onClick())

    await waitFor(() =>
      expect(mocks.followUser).toHaveBeenCalledWith({ targetUserId: 'u_ada' }),
    )
    expect(mocks.followUser).not.toHaveBeenCalledWith({
      targetUserId: 'u_bob',
    })
    // Only Ada's cached profile moved; Bob's page is untouched.
    expect(cached(ada)?.viewerFollowsProfile).toBe(true)
    expect(cached(bob)?.viewerFollowsProfile).toBe(false)
    expect(cached(bob)?.stats.followersCount).toBe(5)
  })

  it('remounts the profile route when the username changes', () => {
    const remountDeps = PublicProfileRoute.options.remountDeps as (opts: {
      params: { username: string }
    }) => unknown

    expect(remountDeps({ params: { username: 'ada' } })).toEqual({
      username: 'ada',
    })
    expect(remountDeps({ params: { username: 'bob' } })).not.toEqual(
      remountDeps({ params: { username: 'ada' } }),
    )
  })
})
