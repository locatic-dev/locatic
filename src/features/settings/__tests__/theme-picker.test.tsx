// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_IDS } from '@/lib/theme'

const { setTheme, themeState } = vi.hoisted(() => ({
  setTheme: vi.fn(),
  themeState: { current: undefined as string | undefined },
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: themeState.current, setTheme }),
}))

import { ThemePicker } from '../theme-picker'

function radioFor(themeId: string) {
  return screen.getByRole('radio', { name: new RegExp(`^${themeId}\\b`) })
}

function swatchesFor(themeId: string) {
  const label = (radioFor(themeId) as HTMLInputElement).labels?.[0]
  const scope = label?.querySelector('[data-theme]')
  return { scope, dots: [...(scope?.children ?? [])] as HTMLElement[] }
}

describe('ThemePicker', () => {
  beforeEach(() => {
    // user-event's arrow-key radio walk calls CSS.escape, which jsdom lacks.
    vi.stubGlobal('CSS', { escape: (value: string) => value })
    themeState.current = undefined
    setTheme.mockReset()
    setTheme.mockImplementation((theme: string) => {
      themeState.current = theme
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('selects teal and labels it as the default when no theme is stored', () => {
    render(<ThemePicker />)

    expect(screen.getByRole('group', { name: 'accent theme' })).toBeTruthy()
    expect(
      screen.getByRole('radio', { name: 'teal (default)' }),
    ).toHaveProperty('checked', true)
    expect(screen.getByRole('radio', { name: 'violet' })).toHaveProperty(
      'checked',
      false,
    )
    expect(screen.getByRole('radio', { name: 'amber' })).toHaveProperty(
      'checked',
      false,
    )
  })

  it('paints every swatch from its own theme scope, not the active theme', () => {
    themeState.current = 'amber'
    render(<ThemePicker />)

    for (const themeId of THEME_IDS) {
      const { scope, dots } = swatchesFor(themeId)

      // The accent tokens resolve inside the closest data-theme scope, so the
      // swatch must sit in a scope named after its own option.
      expect(scope?.getAttribute('data-theme')).toBe(themeId)
      expect(dots).toHaveLength(2)
      for (const dot of dots) {
        expect(dot.closest('[data-theme]')).toBe(scope)
      }

      // Rebuilt from the per-theme components; `--primary`/`--lx-accent` are
      // computed at :root and would paint every swatch in the active theme.
      const [primary, secondary] = dots.map((dot) => dot.style.backgroundColor)
      expect(primary).toContain('var(--lx-accent-h)')
      expect(primary).not.toMatch(/--primary|--lx-accent\)/)
      expect(secondary).toBe('var(--lx-accent-2)')
      expect(`${primary} ${secondary}`).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    }
  })

  it('switches theme with the keyboard inside one native radio group', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<ThemePicker />)

    const teal = radioFor('teal')
    const violet = radioFor('violet')
    const amber = radioFor('amber')
    expect(violet.getAttribute('name')).toBe(teal.getAttribute('name'))
    expect(amber.getAttribute('name')).toBe(teal.getAttribute('name'))

    await user.tab()
    expect(document.activeElement).toBe(teal)

    await user.keyboard('{ArrowRight}')
    rerender(<ThemePicker />)
    expect(setTheme).toHaveBeenLastCalledWith('violet')
    expect(violet).toHaveProperty('checked', true)
    expect(document.activeElement).toBe(violet)

    fireEvent.click(amber)
    rerender(<ThemePicker />)
    expect(setTheme).toHaveBeenLastCalledWith('amber')
    expect(amber).toHaveProperty('checked', true)
  })
})
