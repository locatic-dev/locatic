// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { LOCATIC_DEFINITION } from '@/features/about/about-content'
import { AboutDialog } from '../about-dialog'

describe('AboutDialog', () => {
  it('opens the letter with GitHub links to the founders and the repository', async () => {
    render(
      <AboutDialog>
        <button type="button">about</button>
      </AboutDialog>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'about' }))

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/Thanks for signing up/)).toBeTruthy()
    expect(screen.getByText(LOCATIC_DEFINITION)).toBeTruthy()
    const founder = screen.getAllByRole('link', { name: 'Saketha Rama' })[0]
    expect(founder.getAttribute('href')).toBe(
      'https://github.com/bv-saketha-rama',
    )
    expect(
      screen.getAllByRole('link', { name: 'Avinash Changrani' }).length,
    ).toBeGreaterThan(0)
    expect(
      screen
        .getByRole('link', { name: /follow locatic on github/ })
        .getAttribute('href'),
    ).toBe('https://github.com/locatic-dev/locatic')
    // Section headings sit under the dialog title.
    expect(
      screen.getByRole('heading', { level: 3, name: 'Who we are' }),
    ).toBeTruthy()
  })
})
