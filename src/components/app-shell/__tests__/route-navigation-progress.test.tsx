// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const routerState = vi.hoisted(() => ({
  isLoading: false,
}))

vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({
    select,
  }: {
    select?: (state: typeof routerState) => unknown
  }) => (select ? select(routerState) : routerState),
}))

import { RouteNavigationProgress } from '../route-navigation-progress'

describe('RouteNavigationProgress', () => {
  beforeEach(() => {
    routerState.isLoading = false
  })

  it('stays hidden when the router is idle', () => {
    render(<RouteNavigationProgress />)

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('renders an accessible progress affordance while a route is loading', () => {
    routerState.isLoading = true

    render(<RouteNavigationProgress />)

    expect(screen.getByRole('status').textContent).toContain('loading route')
  })
})
