// @vitest-environment jsdom
import { ConvexQueryClient } from '@convex-dev/react-query'
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { StrictMode, useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  reportError: vi.fn(),
  userId: 'user_a' as string | null,
}))
vi.mock('@clerk/tanstack-react-start', () => ({
  useClerk: () => ({ signOut: mocks.signOut }),
  useAuth: () => ({ isLoaded: true, userId: mocks.userId }),
}))
vi.mock('@/lib/action-error', () => ({ reportActionError: mocks.reportError }))

import { SignOutProvider, useSignOut } from '../sign-out'

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  mocks.userId = 'user_a'
})

describe('SignOutProvider', () => {
  it('commits progress, unmounts consumers and removes cached watches before revoking the session', async () => {
    const pending = deferred()
    const events: string[] = []
    const unsubscribeWatch = vi.fn(() => events.push('unsubscribe'))
    const adapter = new ConvexQueryClient({
      watchQuery: () => ({
        onUpdate: () => unsubscribeWatch,
        localQueryResult: () => 'private feed',
      }),
    } as never)
    const client = new QueryClient({
      defaultOptions: {
        queries: { gcTime: Infinity, queryFn: async () => 'private feed' },
      },
    })
    adapter.connect(client)
    const queryKey = ['convexQuery', 'home:list', {}] as const
    client.setQueryData(queryKey, 'private feed')
    let requestSignOut!: () => void
    function PrivatePage() {
      requestSignOut = useSignOut()
      const { data } = useQuery({ queryKey, enabled: false })
      useEffect(
        () => () => {
          events.push('unmount')
        },
        [],
      )
      return <button onClick={requestSignOut}>{String(data)}</button>
    }
    mocks.signOut.mockImplementation(() => {
      events.push('signOut')
      expect(screen.getByRole('status').textContent).toContain('signing out')
      expect(screen.queryByText('private feed')).toBeNull()
      expect(client.getQueryCache().getAll()).toHaveLength(0)
      return pending.promise
    })
    render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <SignOutProvider>
            <PrivatePage />
          </SignOutProvider>
        </QueryClientProvider>
      </StrictMode>,
    )
    events.length = 0

    act(() => {
      requestSignOut()
      requestSignOut()
    })
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce())
    expect(mocks.signOut).toHaveBeenCalledWith({ redirectUrl: '/' })
    expect(events).toEqual(['unmount', 'unsubscribe', 'signOut'])
    expect(unsubscribeWatch).toHaveBeenCalledOnce()
    expect(screen.getByRole('status').textContent).toContain('signing out')

    // Clerk resolves only after its framework navigation finishes.
    await act(async () => {
      mocks.userId = null
      pending.resolve()
    })
    expect(screen.queryByRole('status')).toBeNull()
    adapter.unsubscribe?.()
    client.clear()
  })

  it('recovers a failed request, reports it and permits retry', async () => {
    const pending = deferred()
    mocks.signOut
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(undefined)
    function Page() {
      const signOut = useSignOut()
      return <button onClick={signOut}>sign out</button>
    }
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <SignOutProvider>
          <Page />
        </SignOutProvider>
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'sign out' }))
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce())
    const error = new Error('network unavailable')
    await act(async () => pending.reject(error))
    expect(mocks.reportError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        title: "couldn't sign out",
        retry: expect.any(Function),
      }),
    )
    expect(screen.getByRole('button', { name: 'sign out' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'sign out' }))
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(2))
    client.clear()
  })
})

it.each([null, 'user_b'])(
  'retires the previous session cache on identity change to %s',
  async (nextUserId) => {
    mocks.userId = 'user_a'
    const client = new QueryClient({
      defaultOptions: {
        queries: { staleTime: Infinity, queryFn: async () => null },
      },
    })
    const key = ['convexQuery', 'users:viewerBootstrap', {}] as const
    client.setQueryData(key, { viewer: { id: 'user_a' } })
    function Page() {
      const { data } = useQuery({ queryKey: key, enabled: false })
      return <p>{data ? JSON.stringify(data) : 'no previous viewer'}</p>
    }
    const tree = () => (
      <QueryClientProvider client={client}>
        <SignOutProvider>
          <Page />
        </SignOutProvider>
      </QueryClientProvider>
    )
    const view = render(tree())
    expect(screen.getByText(/user_a/)).toBeTruthy()
    mocks.userId = nextUserId
    view.rerender(tree())
    await waitFor(() => expect(client.getQueryData(key)).toBeUndefined())
    expect(screen.queryByText(/user_a/)).toBeNull()
    mocks.userId = 'user_b'
    view.rerender(tree())
    await screen.findByText('no previous viewer')
    expect(screen.queryByText(/user_a/)).toBeNull()
    expect(mocks.signOut).not.toHaveBeenCalled()
    client.clear()
  },
)
