// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  ProfileRoutePending,
  ProjectRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '../route-pending'

describe('route pending screens', () => {
  it('uses fast route pending timings with a short minimum display', () => {
    expect(ROUTE_PENDING_MS).toBe(150)
    expect(ROUTE_PENDING_MIN_MS).toBe(250)
  })

  it('renders an accessible project-detail-shaped pending state', () => {
    const { container } = render(<ProjectRoutePending />)

    expect(screen.getByRole('status').textContent).toContain('loading project')
    expect(container.querySelector('.lx-page-width-detail')).toBeTruthy()
    expect(container.querySelectorAll('.rounded-card').length).toBeGreaterThan(
      5,
    )
  })

  it('renders an accessible profile pending state', () => {
    const { container } = render(<ProfileRoutePending />)

    expect(screen.getByRole('status').textContent).toContain('loading profile')
    expect(container.querySelector('.lx-page-width-detail')).toBeTruthy()
    expect(container.querySelectorAll('.rounded-card').length).toBeGreaterThan(
      3,
    )
  })
})
