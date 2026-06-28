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

  it('uses a mobile-first wrapping grid instead of forcing horizontal overflow', () => {
    const { container } = render(
      <ProfileContentTabs
        activeTab="projects"
        isRoutePending={false}
        tabs={tabs}
        onSelectTab={vi.fn()}
      />,
    )

    expect(container.querySelector('.grid-cols-2')).toBeTruthy()
    expect(
      container.querySelector('.min-\\[520px\\]\\:grid-cols-3'),
    ).toBeTruthy()
    expect(container.querySelector('.lg\\:grid-cols-5')).toBeTruthy()
    expect(container.querySelector('.overflow-x-auto')).toBeNull()
    expect(container.querySelector('.min-w-max')).toBeNull()
    expect(container.querySelector('.whitespace-nowrap')).toBeTruthy()
  })
})
