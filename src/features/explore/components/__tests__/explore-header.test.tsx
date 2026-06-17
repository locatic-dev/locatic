// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Doc, Id } from '../../../../../convex/_generated/dataModel'
import { ExploreHeader } from '../explore-header'

function renderHeader(
  overrides: Partial<Parameters<typeof ExploreHeader>[0]> = {},
) {
  const props = {
    availableCities: [] as Array<Doc<'cities'>>,
    cityQuery: '',
    currentScope: 'custom' as const,
    mode: 'projects' as const,
    onCityQueryChange: vi.fn(),
    onModeChange: vi.fn(),
    onRemoveCity: vi.fn(),
    onResetExplore: vi.fn(),
    onSelectCity: vi.fn(),
    onSearchQueryChange: vi.fn(),
    pendingCityIds: false,
    resetPending: false,
    searchQuery: '',
    selectedCityChips: [
      { id: 'city_1' as Id<'cities'>, name: 'Bengaluru, Karnataka, India' },
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
    expect(screen.getByText('near')).toBeTruthy()
    expect(screen.getByText('Bengaluru, Karnataka, India')).toBeTruthy()

    const cityInput = screen.getByLabelText('Add a city filter')
    expect(cityInput.getAttribute('placeholder')).toBe('+ add city')

    fireEvent.click(screen.getByLabelText('Remove Bengaluru, Karnataka, India'))
    expect(props.onRemoveCity).toHaveBeenCalledWith('city_1')
  })

  it('keeps the city add control on a stable responsive basis', () => {
    renderHeader()
    const cityInput = screen.getByLabelText('Add a city filter')
    const comboboxRoot = cityInput.closest('.basis-full')

    expect(comboboxRoot).toBeTruthy()
    expect(comboboxRoot?.className).toContain('sm:basis-56')
    expect(comboboxRoot?.className).toContain('sm:grow-0')
  })

  it('switches mode on tab click', () => {
    const { props } = renderHeader()
    fireEvent.click(screen.getByRole('button', { name: 'builders' }))
    expect(props.onModeChange).toHaveBeenCalledWith('builders')
  })

  it('renders mode-aware scope copy', () => {
    renderHeader({ currentScope: 'global', mode: 'builders' })
    expect(screen.getByText('showing builders everywhere')).toBeTruthy()
  })

  it('shows reset only for resettable modes', () => {
    const { props, rerender } = renderHeader({ mode: 'posts' })

    fireEvent.click(screen.getByRole('button', { name: 'reset' }))
    expect(props.onResetExplore).toHaveBeenCalledTimes(1)

    rerender(<ExploreHeader {...props} mode="builders" />)
    expect(screen.queryByRole('button', { name: 'reset' })).toBeNull()
  })
})
