import { describe, it, expect } from 'vitest'
import { LANG_COLORS } from '../lang-dot'

describe('LANG_COLORS', () => {
  it('has a color for TypeScript', () => {
    expect(LANG_COLORS['TypeScript']).toBe('#3178c6')
  })

  it('has a color for Rust', () => {
    expect(LANG_COLORS['Rust']).toBe('#dea584')
  })

  it('has a color for Go', () => {
    expect(LANG_COLORS['Go']).toBe('#00ADD8')
  })

  it('does not have an entry for unknown languages', () => {
    expect(LANG_COLORS['Fortran']).toBeUndefined()
  })

  it('contains at least 10 languages', () => {
    expect(Object.keys(LANG_COLORS).length).toBeGreaterThanOrEqual(10)
  })
})
