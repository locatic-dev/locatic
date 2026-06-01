// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const convexAuthState = vi.hoisted(() => ({
  current: {
    isAuthenticated: false,
    isLoading: true,
    isRefreshing: false,
  },
}))

vi.mock('convex/react', () => ({
  ConvexReactClient: vi.fn(),
  useConvexAuth: () => convexAuthState.current,
}))

vi.mock('convex/react-clerk', () => ({
  ConvexProviderWithClerk: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  useAuth: vi.fn(),
}))

import { ConvexAuthReadyBoundary } from '../provider'

describe('ConvexAuthReadyBoundary', () => {
  afterEach(() => {
    convexAuthState.current = {
      isAuthenticated: false,
      isLoading: true,
      isRefreshing: false,
    }
  })

  it('renders fallback while Convex auth is loading', () => {
    render(
      <ConvexAuthReadyBoundary fallback={<div>loading auth</div>}>
        <div>private content</div>
      </ConvexAuthReadyBoundary>,
    )

    expect(screen.getByText('loading auth')).toBeTruthy()
    expect(screen.queryByText('private content')).toBeNull()
  })

  it('blocks authenticated-only content until Convex auth is authenticated', () => {
    convexAuthState.current = {
      isAuthenticated: false,
      isLoading: false,
      isRefreshing: false,
    }

    render(
      <ConvexAuthReadyBoundary
        fallback={<div>waiting for token</div>}
        requireAuthenticated
      >
        <div>private content</div>
      </ConvexAuthReadyBoundary>,
    )

    expect(screen.getByText('waiting for token')).toBeTruthy()
    expect(screen.queryByText('private content')).toBeNull()
  })

  it('renders children once Convex auth is ready', () => {
    convexAuthState.current = {
      isAuthenticated: true,
      isLoading: false,
      isRefreshing: false,
    }

    render(
      <ConvexAuthReadyBoundary
        fallback={<div>waiting for token</div>}
        requireAuthenticated
      >
        <div>private content</div>
      </ConvexAuthReadyBoundary>,
    )

    expect(screen.getByText('private content')).toBeTruthy()
    expect(screen.queryByText('waiting for token')).toBeNull()
  })
})
