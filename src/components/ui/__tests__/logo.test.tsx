// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Logo } from '../logo'

const HARD_CODED_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch)\(/i

describe('Logo', () => {
  it('renders an inline mark painted only with currentColor so it follows the theme', () => {
    const { container } = render(<Logo size={32} />)

    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.innerHTML).not.toMatch(HARD_CODED_COLOUR)

    const painted = [...container.querySelectorAll('[fill], [stroke]')]
    expect(painted.length).toBeGreaterThan(0)
    for (const node of painted) {
      for (const attribute of ['fill', 'stroke']) {
        const value = node.getAttribute(attribute)
        if (value !== null) expect(value).toBe('currentColor')
      }
    }
    expect(svg?.getAttribute('width')).toBe('32')
  })

  it('is decorative by default and named when given alt text', () => {
    const { container, rerender } = render(<Logo />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    )
    expect(screen.queryByRole('img')).toBeNull()

    rerender(<Logo alt="Locatic" />)
    expect(screen.getByRole('img', { name: 'Locatic' })).toBeTruthy()
  })
})
