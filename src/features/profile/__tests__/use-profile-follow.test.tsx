// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { ConvexError } from 'convex/values'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Id } from '../../../../convex/_generated/dataModel'

import { publicProfileOverviewQueryOptions } from '@/features/profile/queries'
import type { PublicProfileOverview } from '@/features/profile/types'
import { useProfileFollow } from '../use-profile-follow'

const mocks = vi.hoisted(() => {
  const toastError = vi.fn()
  return {
    followUser: vi.fn(),
    toast: Object.assign(vi.fn(), { error: toastError }),
    toastError,
    unfollowUser: vi.fn(),
  }
})

vi.mock('sonner', () => ({ toast: mocks.toast }))

vi.mock('@/features/follows/mutations', () => ({
  useFollowUser: () => mocks.followUser,
  useUnfollowUser: () => mocks.unfollowUser,
}))

const overview = {
  userId: 'user_ada',
  githubUsername: 'ada',
  stats: { followersCount: 3, followingCount: 1 },
  viewerFollowsProfile: true,
} as unknown as PublicProfileOverview

type ToastOptions = { action?: { label: string; onClick: () => void } }

function setup() {
  const queryClient = new QueryClient()
  const queryKey = publicProfileOverviewQueryOptions('ada').queryKey
  queryClient.setQueryData(queryKey, overview)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(
    () =>
      useProfileFollow({
        githubUsername: 'ada',
        username: 'ada',
        userId: 'user_ada' as Id<'users'>,
      }),
    { wrapper },
  )
  const cached = () => queryClient.getQueryData<PublicProfileOverview>(queryKey)

  return { cached, result }
}

describe('useProfileFollow', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('reports a failed undo with its reason and leaves the unfollow in place', async () => {
    mocks.unfollowUser.mockResolvedValue(null)
    mocks.followUser.mockRejectedValue(
      new ConvexError('Too many requests. Try again in 30s'),
    )
    const { cached, result } = setup()

    await act(() => result.current.toggleFollow(true))
    const [, options] = mocks.toast.mock.calls[0] as [string, ToastOptions]
    act(() => options.action?.onClick())

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "couldn't undo",
        expect.objectContaining({
          description: 'slow down. try again in 30s.',
        }),
      ),
    )
    // The failed re-follow rolls back to the unfollowed state it started from.
    expect(cached()?.viewerFollowsProfile).toBe(false)
    expect(cached()?.stats.followersCount).toBe(2)
  })

  it('rolls back a failed unfollow and offers no undo', async () => {
    mocks.unfollowUser.mockRejectedValue(new Error('network down'))
    const { cached, result } = setup()

    await act(() => result.current.toggleFollow(true))

    expect(mocks.toast).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith(
      "couldn't unfollow",
      expect.anything(),
    )
    expect(cached()?.viewerFollowsProfile).toBe(true)
    expect(cached()?.stats.followersCount).toBe(3)
  })

  it('follows without an undo toast', async () => {
    mocks.followUser.mockResolvedValue(null)
    const { result } = setup()

    await act(() => result.current.toggleFollow(false))

    expect(mocks.followUser).toHaveBeenCalledWith({ targetUserId: 'user_ada' })
    expect(mocks.toast).not.toHaveBeenCalled()
  })
})
