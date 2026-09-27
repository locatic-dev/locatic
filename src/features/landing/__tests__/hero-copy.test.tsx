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
  it('lets visitors browse public Explore without signing in', () => {
    render(<HeroCopy />)

    expect(
      screen.getByRole('link', { name: 'browse explore' }).getAttribute('href'),
    ).toBe('/explore')
    expect(
      screen
        .getByRole('link', { name: /sign in with GitHub/ })
        .getAttribute('href'),
    ).toBe('/sign-in/$')
  })
})
