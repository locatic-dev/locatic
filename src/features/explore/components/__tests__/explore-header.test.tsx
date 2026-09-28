// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Doc, Id } from '../../../../../convex/_generated/dataModel'
import type { ExploreFilters } from '../../state'
import { ExploreHeader } from '../explore-header'

function renderHeader(
  overrides: Partial<Parameters<typeof ExploreHeader>[0]> = {},
) {
  const props = {
    availableCities: [] as Array<Doc<'cities'>>,
    cityQuery: '',
    citySearchPending: false,
    currentScope: 'custom' as const,
    filters: {} as ExploreFilters,
    mode: 'projects' as const,
    onCityQueryChange: vi.fn(),
    onFiltersChange: vi.fn(),
    onModeChange: vi.fn(),
    onRemoveCity: vi.fn(),
    onResetExplore: vi.fn(),
    onSelectCity: vi.fn(),
    onSearchQueryChange: vi.fn(),
    resetPending: false,
    searchQuery: '',
    selectedCityChips: [
      {
        id: 'city_1' as Id<'cities'>,
        name: 'Bengaluru, Karnataka, India',
        shortName: 'Bengaluru',
      },
    ],
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

  it('leaves out text search and reset on public Explore', () => {
    renderHeader({ onResetExplore: undefined, showSearch: false })

    expect(screen.queryByLabelText('Search projects')).toBeNull()
    expect(screen.queryByRole('button', { name: 'reset' })).toBeNull()
    expect(screen.getByLabelText('Add a city filter')).toBeTruthy()
  })

  it('routes content typing to the search handler, not the city filter', () => {
    const { props } = renderHeader()
    fireEvent.change(screen.getByLabelText('Search projects'), {
      target: { value: 'convex' },
    })
    expect(props.onSearchQueryChange).toHaveBeenCalledWith('convex')
    expect(props.onCityQueryChange).not.toHaveBeenCalled()
  })

  it('exposes the city filter as a compact add affordance with chips', () => {
    const { props } = renderHeader()
    expect(screen.getByText('Bengaluru, Karnataka, India')).toBeTruthy()

    const cityInput = screen.getByLabelText('Add a city filter')
    expect(cityInput.getAttribute('placeholder')).toBe('+ add city')

    fireEvent.click(screen.getByLabelText('Remove Bengaluru, Karnataka, India'))
    expect(props.onRemoveCity).toHaveBeenCalledWith('city_1')
  })

  it('says while the city search runs and when nothing matches', () => {
    const { props, rerender } = renderHeader({
      cityQuery: 'zzz',
      citySearchPending: true,
    })
    fireEvent.focus(screen.getByLabelText('Add a city filter'))
    expect(screen.getByRole('status').textContent).toBe('searching…')

    rerender(<ExploreHeader {...props} citySearchPending={false} />)
    expect(screen.getByRole('status').textContent).toBe('no cities match')
  })

  it('switches mode on tab click', () => {
    const { props } = renderHeader()
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
    })
    expect(screen.getByText('showing everywhere')).toBeTruthy()
    expect(screen.getByText('// builders from everywhere')).toBeTruthy()
    expect(
      screen.getByRole('heading', { level: 1, name: 'explore' }),
    ).toBeTruthy()
  })

  it('shows reset only for resettable modes', () => {
    const { props, rerender } = renderHeader({ mode: 'posts' })

    fireEvent.click(screen.getByRole('button', { name: 'reset' }))
    expect(props.onResetExplore).toHaveBeenCalledTimes(1)

    rerender(<ExploreHeader {...props} mode="builders" />)
    expect(screen.queryByRole('button', { name: 'reset' })).toBeNull()
  })

  it('applies primary language and topic in their canonical form', () => {
    const { props } = renderHeader()

    fireEvent.click(screen.getByRole('button', { name: 'filter' }))
    fireEvent.change(screen.getByLabelText('primary language'), {
      target: { value: '  TypeScript ' },
    })
    fireEvent.change(screen.getByLabelText('topic'), {
      target: { value: 'AI/Agents' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'apply' }))

    expect(props.onFiltersChange).toHaveBeenCalledWith({
      language: 'typescript',
      topic: 'ai-agents',
    })
    // The popover closes once applied.
    expect(screen.queryByLabelText('primary language')).toBeNull()
  })

  it('clears a filter emptied in the form and ignores input that normalises to nothing', () => {
    const { props } = renderHeader({ filters: { language: 'rust' } })

    fireEvent.click(screen.getByRole('button', { name: 'filter' }))
    const language = screen.getByLabelText('primary language')
    expect((language as HTMLInputElement).value).toBe('rust')
    fireEvent.change(language, { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('topic'), {
      target: { value: '!!!' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'apply' }))

    expect(props.onFiltersChange).toHaveBeenCalledWith({
      language: undefined,
      topic: undefined,
    })
  })

  it('shows applied filters as removable chips', () => {
    const { props } = renderHeader({
      filters: { language: 'rust', topic: 'webgpu' },
    })

    expect(screen.getByText('primary language: rust')).toBeTruthy()
    expect(screen.getByText('topic: #webgpu')).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove topic filter webgpu' }),
    )
    expect(props.onFiltersChange).toHaveBeenCalledWith({ topic: undefined })
  })

  it('offers the open-to-collab chip in builders mode only', () => {
    const { props, rerender } = renderHeader({ mode: 'builders' })
    const chip = screen.getByRole('button', { name: 'open to collab' })

    expect(chip.getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('button', { name: 'filter' })).toBeNull()
    fireEvent.click(chip)
    expect(props.onFiltersChange).toHaveBeenCalledWith({ openToCollab: true })

    rerender(
      <ExploreHeader
        {...props}
        mode="builders"
        filters={{ openToCollab: true }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'open to collab' }))
    expect(props.onFiltersChange).toHaveBeenLastCalledWith({
      openToCollab: undefined,
    })

    rerender(<ExploreHeader {...props} mode="posts" />)
    expect(screen.queryByRole('button', { name: 'open to collab' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'filter' })).toBeNull()
  })
})
