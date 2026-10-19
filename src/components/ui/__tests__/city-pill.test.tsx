// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params = {},
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode
    params?: Record<string, string>
    to: string
  }) => (
    <a
      href={to.replace(/\$(\w+)/g, (_match, key: string) => params[key] ?? '')}
      {...props}
    >
      {children}
    </a>
  ),
}))

import { CityPill, LocationPill } from '../city-pill'

describe('LocationPill', () => {
  it('links an exact-city member to the city page by slug', () => {
    render(
      <LocationPill
        location={{
          kind: 'city',
          cityId: 'city_blr',
          cityName: 'Bengaluru, Karnataka, India',
          citySlug: 'bengaluru-in',
        }}
      />,
    )

    expect(
      screen
        .getByRole('link', { name: 'Bengaluru, Karnataka, India' })
        .getAttribute('href'),
    ).toBe('/c/bengaluru-in')
  })

  it('falls back to the city id when no slug is known', () => {
    render(
      <LocationPill
        location={{
          kind: 'city',
          cityId: 'city_blr',
          cityName: 'Bengaluru, Karnataka, India',
        }}
      />,
    )

    const link = screen.getByRole('link', {
      name: 'Bengaluru, Karnataka, India',
    })
    // Stored snapshots carry only the id; the city page redirects it to the
    // slug.
    expect(link.getAttribute('href')).toBe('/c/city_blr')
    expect(link.getAttribute('title')).toBe(
      'Bengaluru, Karnataka, India city page',
    )
  })

  it('shows a region label as plain text', () => {
    render(
      <LocationPill
        location={{ kind: 'region', regionLabel: 'Karnataka, India' }}
      />,
    )

    expect(screen.getByText('Karnataka, India')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('renders nothing when no location is disclosed', () => {
    const { container } = render(<LocationPill location={{ kind: 'none' }} />)

    expect(container.textContent).toBe('')
  })
})

describe('CityPill', () => {
  it('stays a removable chip, not a link, when it can be removed', () => {
    const onRemove = vi.fn()
    render(
      <CityPill city="Berlin, Germany" cityId="city_ber" onRemove={onRemove} />,
    )

    expect(screen.queryByRole('link')).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Berlin, Germany' }),
    )
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('is plain text without a city id', () => {
    render(<CityPill city="Karnataka, India" />)

    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByTitle('Karnataka, India')).toBeTruthy()
  })

  it('keeps link and text semantics in the inline variant', () => {
    const { rerender } = render(
      <CityPill variant="inline" city="Hyderabad" cityId="city_hyd" />,
    )

    expect(
      screen.getByRole('link', { name: 'Hyderabad' }).getAttribute('href'),
    ).toBe('/c/city_hyd')

    rerender(<CityPill variant="inline" city="Telangana, India" />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByTitle('Telangana, India').textContent).toBe(
      'Telangana, India',
    )
  })

  it('sizes only the linked inline variant as a pointer target', () => {
    const { rerender } = render(
      <CityPill variant="inline" city="Hyderabad" cityId="city_hyd" />,
    )

    // 24px (WCAG 2.2 target size) with a mouse, 44px on coarse pointers.
    const link = screen.getByRole('link', { name: 'Hyderabad' })
    expect(link.className).toContain('min-h-6')
    expect(link.className).toContain('pointer-coarse:min-h-11')
    expect(link.className).toContain('items-center')

    rerender(<CityPill variant="inline" city="Telangana, India" />)
    const text = screen.getByTitle('Telangana, India')
    expect(text.className).not.toContain('min-h-6')
    expect(text.className).not.toContain('pointer-coarse:min-h-11')
  })
})
