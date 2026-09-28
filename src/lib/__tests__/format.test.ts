import { describe, it, expect } from 'vitest'
import { compactNumber, formatUnreadCount, unreadNavLabel } from '../format'

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

describe('unread counts', () => {
  it('shows the exact count up to 99 and 99+ from the server cap on', () => {
    expect(formatUnreadCount(1)).toBe('1')
    expect(formatUnreadCount(99)).toBe('99')
    expect(formatUnreadCount(100)).toBe('99+')
    expect(formatUnreadCount(150)).toBe('99+')
  })

  it('names a nav link with its unread count only when there is one', () => {
    expect(unreadNavLabel('inbox', 0)).toBe('inbox')
    expect(unreadNavLabel('inbox', 3)).toBe('inbox, 3 unread')
    expect(unreadNavLabel('notifications', 100)).toBe(
      'notifications, 99+ unread',
    )
  })
})
