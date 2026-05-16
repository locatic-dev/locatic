import { describe, it, expect } from 'vitest'
import { compactNumber } from '../format'

describe('compactNumber', () => {
  it('returns plain string for numbers under 1000', () => {
    expect(compactNumber(42)).toBe('42')
    expect(compactNumber(999)).toBe('999')
  })

  it('formats thousands as k', () => {
    expect(compactNumber(1000)).toBe('1.0k')
    expect(compactNumber(8142)).toBe('8.1k')
    expect(compactNumber(12500)).toBe('12.5k')
  })

  it('formats millions as m', () => {
    expect(compactNumber(1_000_000)).toBe('1.0m')
    expect(compactNumber(2_500_000)).toBe('2.5m')
  })

  it('handles zero', () => {
    expect(compactNumber(0)).toBe('0')
  })
})
