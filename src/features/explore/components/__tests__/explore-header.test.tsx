// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Id } from '../../../../../convex/_generated/dataModel'
import { ExploreHeader } from '../explore-header'

function renderHeader(
  overrides: Partial<Parameters<typeof ExploreHeader>[0]> = {},
) {
  const props = {
    activeFilterCount: 0,
    currentScope: 'custom' as const,
    filtersOpen: false,
    mode: 'projects' as const,
    onModeChange: vi.fn(),
    onOpenFilters: vi.fn(),
    onSearchQueryChange: vi.fn(),
    searchQuery: '',
    selectedCityChips: [
      {
        id: 'city_1' as Id<'cities'>,
        name: 'Bengaluru, Karnataka, India',
        shortName: 'Bengaluru',
      },
    ],
    strip: { place: 'bengaluru', builderCount: 142 },
    ...overrides,
  } satisfies Parameters<typeof ExploreHeader>[0]

  return { props, ...render(<ExploreHeader {...props} />) }
}

describe('ExploreHeader', () => {
  it('renders the content search as the primary input', () => {
    renderHeader()
    const search = screen.getByLabelText('Search projects')
    expect(search.getAttribute('placeholder')).toBe(
      'search projects by repo or topic',
    )
  })

  it('leaves out text search on public Explore', () => {
    renderHeader({ showSearch: false })

    expect(screen.queryByLabelText('Search projects')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('routes content typing to the search handler', () => {
    const { props } = renderHeader()
    fireEvent.change(screen.getByLabelText('Search projects'), {
      target: { value: 'convex' },
    })
    expect(props.onSearchQueryChange).toHaveBeenCalledWith('convex')
  })

  it('switches mode on tab click and reports the active mode', () => {
    const { props } = renderHeader()

    const group = screen.getByRole('group', { name: 'Explore mode' })
    expect(group).toBeTruthy()
    expect(
      screen
        .getByRole('button', { name: 'projects' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      screen
        .getByRole('button', { name: 'builders' })
        .getAttribute('aria-pressed'),
    ).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: 'builders' }))
    expect(props.onModeChange).toHaveBeenCalledWith('builders')
  })

  it('names the selected city in the status and eyebrow', () => {
    renderHeader({ currentScope: 'custom' })
    expect(screen.getByText('showing bengaluru')).toBeTruthy()
    expect(screen.getByText('// projects in cities you picked')).toBeTruthy()
  })

  it('says everywhere, not nearby, for the global feed', () => {
    renderHeader({
      currentScope: 'global',
      mode: 'builders',
      selectedCityChips: [],
      strip: { place: 'everywhere', builderCount: null },
    })
    expect(screen.getByText('showing everywhere')).toBeTruthy()
    expect(screen.getByText('// builders from everywhere')).toBeTruthy()
    expect(
      screen.getByRole('heading', { level: 1, name: 'explore' }),
    ).toBeTruthy()
  })

  it('summarises the place on the compact strip', () => {
    const { container, props, rerender } = renderHeader()
    expect(container.textContent).toContain('bengaluru · 142 builders')

    rerender(
      <ExploreHeader
        {...props}
        strip={{ place: 'bengaluru', builderCount: 1 }}
      />,
    )
    expect(container.textContent).toContain('bengaluru · 1 builder')
    expect(container.textContent).not.toContain('1 builders')
  })

  it('opens the filter sheet from a filters button that reports the applied count', () => {
    const { props, rerender } = renderHeader()

    const button = screen.getByRole('button', { name: 'filters' })
    expect(button.getAttribute('aria-haspopup')).toBe('dialog')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(button)
    expect(props.onOpenFilters).toHaveBeenCalledTimes(1)

    rerender(
      <ExploreHeader {...props} activeFilterCount={2} filtersOpen={true} />,
    )
    const counted = screen.getByRole('button', { name: 'filters (2)' })
    expect(counted.getAttribute('aria-expanded')).toBe('true')
  })
})
