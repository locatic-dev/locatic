// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { HeroCopy } from '../hero-copy'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    className,
    to,
  }: {
    children: ReactNode
    className?: string
    to: string
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}))

describe('HeroCopy', () => {
  it('states the product in one line under the eyebrow', () => {
    render(<HeroCopy />)

    expect(screen.getByText('// for builders who ship')).toBeTruthy()
    expect(
      screen.getByRole('heading', { level: 1, name: 'github, with a map.' }),
    ).toBeTruthy()
    expect(
      screen.getByText('find the people shipping in your city.'),
    ).toBeTruthy()
  })

  it('leads to public Explore and offers GitHub sign-in', () => {
    render(<HeroCopy />)

    expect(
      screen
        .getByRole('link', { name: 'explore your city →' })
        .getAttribute('href'),
    ).toBe('/explore')
    // The prompt glyph is decorative; the link reads "sign in with github".
    expect(
      screen
        .getByRole('link', { name: 'sign in with github' })
        .getAttribute('href'),
    ).toBe('/sign-in/$')
  })
})
