// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ContentRoutePending,
  FeedRoutePending,
  NotificationsRoutePending,
  ProfileRoutePending,
  ProjectRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '../route-pending'

afterEach(cleanup)

describe('route pending screens', () => {
  it('uses fast route pending timings with a short minimum display', () => {
    expect(ROUTE_PENDING_MS).toBe(150)
    expect(ROUTE_PENDING_MIN_MS).toBe(250)
  })

  it.each([
    ['content', ContentRoutePending, 'loading'],
    ['feed', FeedRoutePending, 'loading feed'],
  ])(
    'keeps the %s pending frame quiet: a status, no title and no list rows of its own',
    (_name, Pending, label) => {
      render(<Pending />)

      // getByRole throws on a second status: list pages render their own
      // list skeleton once mounted, so the frame must not add another.
      expect(screen.getByRole('status').textContent).toBe(label)
      expect(screen.queryByRole('heading')).toBeNull()
    },
  )

  it('renders the notifications h1 immediately and skeletons only the list', () => {
    render(<NotificationsRoutePending />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'notifications' }),
    ).toBeTruthy()
    const list = screen.getByRole('status', { name: 'loading notifications' })
    expect(within(list).queryByRole('heading')).toBeNull()
    expect(list.children.length).toBeGreaterThan(0)
  })

  it('renders an accessible project-detail pending state', () => {
    render(<ProjectRoutePending />)

    expect(screen.getByRole('status').textContent).toContain('loading project')
  })

  it('reuses the profile content-list skeleton the loaded page shows', () => {
    render(<ProfileRoutePending />)

    expect(screen.getByRole('status').textContent).toContain('loading profile')
    expect(screen.getByLabelText('loading content')).toBeTruthy()
  })
})
