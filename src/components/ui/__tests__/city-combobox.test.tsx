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
    expect(screen.getByRole('option').textContent).toContain(
      'Bengaluru, Karnataka, India',
    )
  })
})
