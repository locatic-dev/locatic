// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { ConvexError } from 'convex/values'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  uiNeedsReload: false,
  search: {} as { redirect?: string },
  signInProps: [] as Array<Record<string, unknown>>,
  recovery: null as null | {
    status: string
    canRestore: boolean
    purgeAfter: number | null
  },
  restore: vi.fn(),
  invalidateQueries: vi.fn(async () => {}),
  navigate: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute:
    () =>
    <TOptions,>(options: TOptions) => ({
      options,
      useSearch: () => mocks.search,
      useRouteContext: () => ({ accountRecovery: mocks.recovery }),
    }),
  redirect: vi.fn(),
  useNavigate: () => mocks.navigate,
}))

vi.mock('@/integrations/clerk/ui-loading', () => ({
  authUiNeedsDocumentReload: () => mocks.uiNeedsReload,
}))

vi.mock('convex/react', () => ({ useMutation: () => mocks.restore }))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))
vi.mock('@/integrations/clerk/sign-out', () => ({
  useSignOut: () => mocks.signOut,
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  SignIn: (props: Record<string, unknown>) => {
    mocks.signInProps.push(props)
    return null
  },
}))

const { Route } = await import('../sign-in.$')
const SignInPage = Route.options.component as ComponentType

const latestProps = () => mocks.signInProps.at(-1) ?? {}

describe('sign-in page destination', () => {
  afterEach(() => {
    mocks.search = {}
    mocks.signInProps = []
    mocks.recovery = null
    mocks.restore.mockReset()
    mocks.navigate.mockReset()
    mocks.signOut.mockReset()
    mocks.invalidateQueries.mockClear()
    cleanup()
  })

  it('keeps the destination across Clerk steps that drop our parameter', () => {
    mocks.search = { redirect: '/project/ada/engine?comment=c1#comment-c1' }
    const { rerender } = render(<SignInPage />)
    expect(latestProps().forceRedirectUrl).toBe(
      '/project/ada/engine?comment=c1#comment-c1',
    )

    // Clerk moves to /sign-in/factor-one without `redirect`.
    mocks.search = {}
    rerender(<SignInPage />)

    expect(latestProps().forceRedirectUrl).toBe(
      '/project/ada/engine?comment=c1#comment-c1',
    )
    expect(latestProps().signUpForceRedirectUrl).toBe(
      `/onboarding?${new URLSearchParams({
        redirect: '/project/ada/engine?comment=c1#comment-c1',
      })}`,
    )
  })

  it('uses the fallbacks when there is no destination', () => {
    render(<SignInPage />)

    expect(latestProps().forceRedirectUrl).toBeNull()
    expect(latestProps().fallbackRedirectUrl).toBe('/home')
    expect(latestProps().signUpFallbackRedirectUrl).toBe('/onboarding')
  })

  it("reads Clerk's same-origin redirect_url when ours is missing", () => {
    const validateSearch = Route.options.validateSearch as (
      search: Record<string, unknown>,
    ) => unknown

    expect(
      validateSearch({
        redirect_url: `${window.location.origin}/u/ada?tab=projects`,
      }),
    ).toEqual({ redirect: '/u/ada?tab=projects' })
    // `redirect` is present as undefined so the router's search merge cannot
    // bring a raw value back.
    expect(
      validateSearch({ redirect_url: 'https://evil.example/u/ada' }),
    ).toStrictEqual({ redirect: undefined })
  })

  it('shows recovery and the deadline instead of another sign-in form while deletion is pending', () => {
    mocks.recovery = {
      status: 'deletion_pending',
      canRestore: true,
      purgeAfter: Date.UTC(2027, 0, 15),
    }
    render(<SignInPage />)

    expect(
      screen.getByRole('heading', { name: 'account scheduled for deletion' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'restore account' })).toBeTruthy()
    expect(screen.getByText(/Jan 15, 2027/)).toBeTruthy()
    expect(mocks.signInProps).toEqual([])
  })

  it('refreshes bootstrap and resumes the destination after a successful restore', async () => {
    mocks.recovery = {
      status: 'deletion_pending',
      canRestore: true,
      purgeAfter: Date.UTC(2027, 0, 15),
    }
    mocks.search = { redirect: '/settings?tab=privacy' }
    mocks.restore.mockResolvedValueOnce(null)
    render(<SignInPage />)

    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'restore account' })),
    )

    expect(mocks.restore).toHaveBeenCalledWith({})
    expect(mocks.invalidateQueries).toHaveBeenCalled()
    expect(mocks.navigate).toHaveBeenCalledWith({
      href: '/settings?tab=privacy',
      replace: true,
    })
  })

  it('keeps a failed restore on the recovery screen with a readable error', async () => {
    mocks.recovery = {
      status: 'deletion_pending',
      canRestore: true,
      purgeAfter: Date.UTC(2027, 0, 15),
    }
    mocks.restore.mockRejectedValueOnce(
      new ConvexError('Restoration window has ended'),
    )
    render(<SignInPage />)

    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'restore account' })),
    )

    expect(screen.getByRole('alert').textContent).toContain(
      'restoration window has ended',
    )
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it.each(['deletion_expired', 'purged'])(
    'does not offer restoration for %s',
    (status) => {
      mocks.recovery = { status, canRestore: false, purgeAfter: null }
      render(<SignInPage />)

      expect(
        screen.queryByRole('button', { name: 'restore account' }),
      ).toBeNull()
      expect(mocks.signInProps).toEqual([])
      fireEvent.click(screen.getByRole('button', { name: 'sign out' }))
      expect(mocks.signOut).toHaveBeenCalledOnce()
    },
  )
})

describe('sign-in UI document entry', () => {
  afterEach(() => {
    mocks.uiNeedsReload = false
  })
  const beforeLoad = Route.options.beforeLoad as (
    options: unknown,
  ) => Promise<unknown>

  it('reloads the same sign-in URL when a landing document has no Clerk UI', async () => {
    mocks.uiNeedsReload = true
    const { redirect } = await import('@tanstack/react-router')
    vi.mocked(redirect).mockImplementationOnce((options) => options as never)
    await expect(
      beforeLoad({
        context: { auth: { isAuthenticated: false } },
        location: { href: '/sign-in?redirect=%2Fsettings%3Ftab%3Dprivacy' },
      }),
    ).rejects.toMatchObject({
      href: '/sign-in?redirect=%2Fsettings%3Ftab%3Dprivacy',
      reloadDocument: true,
    })
  })

  it('keeps direct sign-in and subsequent Clerk steps within their document', async () => {
    await expect(
      beforeLoad({
        context: { auth: { isAuthenticated: false } },
        location: { href: '/sign-in/factor-one' },
      }),
    ).resolves.toEqual({ accountRecovery: null })
  })
})
