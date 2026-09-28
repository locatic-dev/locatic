// @vitest-environment jsdom
import { render } from '@testing-library/react'
import type { ComponentType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  search: {} as { redirect?: string },
  signInProps: [] as Array<Record<string, unknown>>,
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute:
    () =>
    <TOptions,>(options: TOptions) => ({
      options,
      useSearch: () => mocks.search,
    }),
  redirect: vi.fn(),
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
})
