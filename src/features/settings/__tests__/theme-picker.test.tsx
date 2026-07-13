// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { setTheme, themeState } = vi.hoisted(() => ({
  setTheme: vi.fn(),
  themeState: { current: 'teal' },
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: themeState.current, setTheme }),
}))

import { ThemePicker } from '../theme-picker'

describe('ThemePicker', () => {
  beforeEach(() => {
    themeState.current = 'teal'
    setTheme.mockImplementation((theme: string) => {
      themeState.current = theme
    })
  })

  it('uses one labelled native radio group and updates the selected theme', () => {
    const { rerender } = render(<ThemePicker />)

    const teal = screen.getByRole('radio', { name: 'teal' })
    const violet = screen.getByRole('radio', { name: 'violet' })
    const amber = screen.getByRole('radio', { name: 'amber' })

    expect(screen.getByRole('group', { name: 'accent theme' })).toBeTruthy()
    expect(teal).toHaveProperty('checked', true)
    expect(violet.getAttribute('name')).toBe('accent-theme')
    expect(amber.getAttribute('name')).toBe('accent-theme')

    fireEvent.click(violet)
    rerender(<ThemePicker />)

    expect(setTheme).toHaveBeenCalledWith('violet')
    expect(violet).toHaveProperty('checked', true)
  })
})
