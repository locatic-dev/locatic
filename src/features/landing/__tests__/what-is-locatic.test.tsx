// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { LOCATIC_DEFINITION } from '@/features/about/about-content'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode
    to: string
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

import { WhatIsLocatic } from '../what-is-locatic'

describe('WhatIsLocatic', () => {
  it('defines Locatic in plain words and links to /about', () => {
    render(<WhatIsLocatic />)
    expect(
      screen.getByRole('heading', { level: 2, name: 'what is locatic?' }),
    ).toBeTruthy()
    expect(screen.getByText(LOCATIC_DEFINITION)).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: /read more about locatic/ })
        .getAttribute('href'),
    ).toBe('/about')
  })
})
