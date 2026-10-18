// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LOCATIC_DEFINITION } from '../about-content'
import { ABOUT_FAQ } from '../about-faq-content'
import { AboutFaq } from '../about-faq'
import { AboutLetter } from '../about-letter'

describe('about page content', () => {
  it('puts the letter sections at h2 on the page', () => {
    render(<AboutLetter headingLevel="h2" />)
    for (const title of [
      'Where it came from',
      'So what is it?',
      'Who we are',
      'Where we want to take it',
      'Help us grow',
    ]) {
      expect(
        screen.getByRole('heading', { level: 2, name: title }),
      ).toBeTruthy()
    }
    expect(screen.queryByText(/Thanks for signing up/)).toBeNull()
    expect(
      screen
        .getAllByRole('link', { name: 'Avinash Changrani' })[0]
        ?.getAttribute('href'),
    ).toBe('https://github.com/nabobery')
  })

  it('answers each question under its own h3', () => {
    render(<AboutFaq />)
    const faq = screen.getByRole('region', { name: 'questions' })
    expect(within(faq).getAllByRole('heading', { level: 3 })).toHaveLength(
      ABOUT_FAQ.length,
    )
    expect(within(faq).getByText(LOCATIC_DEFINITION)).toBeTruthy()
  })
})
