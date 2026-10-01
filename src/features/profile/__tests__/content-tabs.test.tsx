// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProfileContentTabs } from '../content-tabs'

const tabs = [
  { id: 'projects', label: 'projects', mobileLabel: 'projects', count: 4 },
  { id: 'posts', label: 'posts', mobileLabel: 'posts', count: 2 },
  {
    id: 'contributions',
    label: 'contributions',
    mobileLabel: 'contrib',
    count: 0,
  },
  { id: 'comments', label: 'comments', mobileLabel: 'comments', count: 6 },
  { id: 'liked', label: 'liked', mobileLabel: 'liked', count: 1 },
] as const

describe('ProfileContentTabs', () => {
  it('uses compact mobile copy without losing full tab labels', () => {
    render(
      <ProfileContentTabs
        activeTab="projects"
        isRoutePending={false}
        tabs={tabs}
        onSelectTab={vi.fn()}
      />,
    )

    expect(screen.getByText('contrib')).toBeTruthy()
    expect(screen.getByText('contributions')).toBeTruthy()
  })

  it('keeps all profile tabs directly clickable', () => {
    const handleSelectTab = vi.fn()

    render(
      <ProfileContentTabs
        activeTab="projects"
        isRoutePending={false}
        tabs={tabs}
        onSelectTab={handleSelectTab}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /contrib/i }))

    expect(handleSelectTab).toHaveBeenCalledWith('contributions')
  })

  it('keeps the contribution tab available when contribution details are private', () => {
    render(
      <ProfileContentTabs
        activeTab="projects"
        isRoutePending={false}
        tabs={tabs}
        onSelectTab={vi.fn()}
      />,
    )

    expect(screen.getByText('contrib')).toBeTruthy()
    expect(screen.getByText('contributions')).toBeTruthy()
  })

  it('marks only the active tab as current', () => {
    render(
      <ProfileContentTabs
        activeTab="posts"
        isRoutePending={false}
        tabs={tabs}
        onSelectTab={vi.fn()}
      />,
    )

    const current = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-current') === 'true')
    expect(current).toHaveLength(1)
    expect(current[0]).toBe(screen.getByRole('button', { name: /^posts/ }))
  })

  it('scrolls the tab row so a newly active tab is fully visible', () => {
    const { container, rerender } = render(
      <ProfileContentTabs
        activeTab="projects"
        isRoutePending={false}
        tabs={tabs}
        onSelectTab={vi.fn()}
      />,
    )
    const row = container.querySelector('button')!.parentElement!
    const liked = screen.getByRole('button', { name: /liked/i })
    Object.defineProperty(row, 'clientWidth', { value: 300 })
    Object.defineProperty(liked, 'offsetLeft', { value: 400 })
    Object.defineProperty(liked, 'offsetWidth', { value: 80 })

    rerender(
      <ProfileContentTabs
        activeTab="liked"
        isRoutePending={false}
        tabs={tabs}
        onSelectTab={vi.fn()}
      />,
    )

    // right edge 480 minus the 300px viewport
    expect(row.scrollLeft).toBe(180)
  })

  it('shows counts only when they are known and non-zero', () => {
    render(
      <ProfileContentTabs
        activeTab="projects"
        isRoutePending={false}
        tabs={[
          {
            id: 'projects',
            label: 'projects',
            mobileLabel: 'projects',
            count: 4,
          },
          { id: 'posts', label: 'posts', mobileLabel: 'posts', count: 0 },
          {
            id: 'comments',
            label: 'comments',
            mobileLabel: 'comments',
            count: null,
          },
        ]}
        onSelectTab={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /^projects.*4$/ })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /^posts/ }).textContent,
    ).not.toMatch(/\d/)
    expect(
      screen.getByRole('button', { name: /^comments/ }).textContent,
    ).not.toMatch(/\d/)
  })
})
