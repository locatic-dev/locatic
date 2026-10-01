// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/icons', () => ({
  Plus: () => <svg aria-hidden="true" />,
  Search: () => <svg aria-hidden="true" />,
}))

vi.mock('@/lib/utils', () => ({
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(' '),
}))

import { CityCombobox } from '../city-combobox'
import type { Doc } from '../../../../convex/_generated/dataModel'

const bengaluru = {
  _id: 'city_bengaluru',
  _creationTime: 1,
  address: 'Bengaluru, Karnataka, India',
  aliases: ['Bangalore'],
  country: 'India',
  countryCode: 'IN',
  createdAt: 1,
  displayName: 'Bengaluru, Karnataka, India',
  isActive: true,
  location: { lat: 12.9716, lng: 77.5946 },
  name: 'Bengaluru',
  normalizedName: 'bengaluru, karnataka, india',
  region: 'Karnataka',
  searchText: 'Bengaluru Bangalore Karnataka India',
  slug: 'bengaluru-karnataka-in',
  timezone: 'Asia/Kolkata',
  updatedAt: 1,
} as unknown as Doc<'cities'>

const berlin = {
  ...bengaluru,
  _id: 'city_berlin',
  country: 'Germany',
  countryCode: 'DE',
  displayName: 'Berlin, Germany',
  name: 'Berlin',
  region: undefined,
  slug: 'berlin-de',
} as unknown as Doc<'cities'>

function renderCombobox(
  overrides: Partial<Parameters<typeof CityCombobox>[0]> = {},
) {
  const props = {
    label: 'Search cities',
    query: 'be',
    onQueryChange: vi.fn(),
    cities: [bengaluru, berlin],
    onSelectCity: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof CityCombobox>[0]
  const view = render(<CityCombobox {...props} />)
  const input = screen.getByRole('combobox')
  fireEvent.focus(input)
  return { input, props, ...view }
}

describe('CityCombobox', () => {
  it('does not open suggestions on focus with an empty query', () => {
    render(
      <CityCombobox
        label="Search cities"
        query=""
        onQueryChange={vi.fn()}
        cities={[bengaluru]}
        onSelectCity={vi.fn()}
      />,
    )

    fireEvent.focus(screen.getByRole('combobox'))

    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('does not open or point to hidden options from arrow keys with an empty query', () => {
    render(
      <CityCombobox
        label="Search cities"
        query=""
        onQueryChange={vi.fn()}
        cities={[bengaluru]}
        onSelectCity={vi.fn()}
      />,
    )

    const input = screen.getByRole('combobox')
    fireEvent.keyDown(input, { key: 'ArrowDown' })

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(input.getAttribute('aria-activedescendant')).toBeNull()
  })

  it('opens matching results after the user types', () => {
    const handleQueryChange = vi.fn()

    render(
      <CityCombobox
        label="Search cities"
        query="ben"
        onQueryChange={handleQueryChange}
        cities={[bengaluru]}
        onSelectCity={vi.fn()}
      />,
    )

    fireEvent.focus(screen.getByRole('combobox'))

    expect(screen.getByRole('listbox')).not.toBeNull()
    expect(screen.getByRole('option').textContent).toBe(
      'BengaluruKarnataka, India',
    )
  })

  it('labels each row with its region so same-named cities differ', () => {
    renderCombobox()
    const [first, second] = screen.getAllByRole('option')

    expect(first?.textContent).toBe('BengaluruKarnataka, India')
    expect(second?.textContent).toBe('BerlinGermany')
  })

  it('moves the active option with the arrow keys and selects it on Enter', () => {
    const { input, props } = renderCombobox()
    const [first, second] = screen.getAllByRole('option')
    expect(first?.getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(second?.getAttribute('aria-selected')).toBe('true')
    expect(first?.getAttribute('aria-selected')).toBe('false')
    expect(input.getAttribute('aria-activedescendant')).toBe(second?.id)

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.getAttribute('aria-activedescendant')).toBe(first?.id)

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(props.onSelectCity).toHaveBeenCalledWith(berlin)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('closes on blur and on Escape', () => {
    const { input } = renderCombobox()
    expect(input.getAttribute('aria-expanded')).toBe('true')

    fireEvent.blur(input)
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.getAttribute('aria-activedescendant')).toBeNull()

    fireEvent.focus(input)
    expect(screen.getByRole('listbox')).not.toBeNull()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('keeps the list open while an option is pressed', () => {
    const { props } = renderCombobox()
    const option = screen.getAllByRole('option')[1]!

    // A cancelled mousedown is what keeps focus (and the list) on the input.
    expect(fireEvent.mouseDown(option)).toBe(false)
    fireEvent.click(option)
    expect(props.onSelectCity).toHaveBeenCalledWith(berlin)
  })

  it('reports searching and no matches when the caller tracks the search', () => {
    const { input, props, rerender } = renderCombobox({
      cities: [],
      searching: true,
    })
    expect(screen.getByRole('status').textContent).toBe('searching…')
    expect(input.getAttribute('aria-expanded')).toBe('false')

    rerender(<CityCombobox {...props} searching={false} />)
    expect(screen.getByRole('status').textContent).toBe('no cities match')

    rerender(<CityCombobox {...props} searching={false} query="" />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('stays closed on an empty result when the caller does not track the search', () => {
    renderCombobox({ cities: [] })
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
