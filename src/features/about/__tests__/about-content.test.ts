import { describe, expect, it } from 'vitest'
import { FOUNDERS, LOCATIC_DEFINITION } from '../about-content'
import { ABOUT_FAQ } from '../about-faq-content'

const words = (text: string) => text.trim().split(/\s+/).length

describe('about content', () => {
  it('defines Locatic in one quotable passage', () => {
    expect(LOCATIC_DEFINITION).toMatch(/^Locatic is /)
    expect(words(LOCATIC_DEFINITION)).toBeGreaterThanOrEqual(40)
    expect(words(LOCATIC_DEFINITION)).toBeLessThanOrEqual(80)
  })

  it('keeps every FAQ answer short enough to quote', () => {
    for (const item of ABOUT_FAQ) {
      expect(item.question).toMatch(/\?$/)
      expect(words(item.answer)).toBeLessThan(90)
    }
  })

  it('spells the founders’ names as they write them', () => {
    expect(FOUNDERS.map((founder) => founder.name)).toEqual([
      'Saketha Rama',
      'Avinash Changrani',
    ])
  })
})
