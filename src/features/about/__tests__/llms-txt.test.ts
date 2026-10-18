import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LOCATIC_DEFINITION } from '../about-content'

const llmsTxt = readFileSync(
  new URL('../../../../public/llms.txt', import.meta.url),
  'utf8',
)

describe('public/llms.txt', () => {
  it('opens with the same definition as the site', () => {
    const firstSentence = LOCATIC_DEFINITION.split('. ')[0]
    const summary = llmsTxt.split('\n').find((line) => line.startsWith('> '))
    expect(summary?.startsWith(`> ${firstSentence}.`)).toBe(true)
  })

  it('links only absolute locatic.dev URLs', () => {
    for (const [, url] of llmsTxt.matchAll(/\]\(([^)]+)\)/g)) {
      expect(url).toMatch(/^https:\/\/locatic\.dev\//)
    }
  })
})
