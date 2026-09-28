import { describe, it, expect } from 'vitest'
import { LANG_HUES, langColor } from '../lang-dot'

describe('langColor', () => {
  it('paints every known language at the shared lightness and chroma', () => {
    for (const [lang, hue] of Object.entries(LANG_HUES)) {
      if (hue === null) continue
      expect(langColor(lang)).toBe(
        `oklch(var(--lx-lang-l) var(--lx-lang-c) ${hue})`,
      )
    }
  })

  it('gives different languages different hues', () => {
    expect(langColor('TypeScript')).not.toBe(langColor('Rust'))
  })

  it('renders unknown, missing and grey languages neutral', () => {
    const neutral = 'oklch(var(--lx-lang-l) 0 0)'
    expect(langColor('Fortran')).toBe(neutral)
    expect(langColor(null)).toBe(neutral)
    expect(langColor('C')).toBe(neutral)
  })
})
