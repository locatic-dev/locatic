// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AboutDialog } from '../about-dialog'

describe('AboutDialog', () => {
  it('opens the letter with GitHub links to the founders and the repo', async () => {
    render(<AboutDialog />)
    expect(screen.queryByRole('dialog')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'about' }))

    expect(screen.getByRole('dialog')).toBeTruthy()
    const founder = screen.getAllByRole('link', { name: 'Saketha Rama' })[0]
    expect(founder.getAttribute('href')).toBe(
      'https://github.com/bv-saketha-rama',
    )
    expect(
      screen
        .getByRole('link', { name: /star locatic on github/ })
        .getAttribute('href'),
    ).toBe('https://github.com/locatic-dev/locatic')
  })
})
