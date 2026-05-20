import { describe, expect, it } from 'vitest'
import { parseStoredSidebarCollapsed } from '../sidebar-layout'

describe('parseStoredSidebarCollapsed', () => {
  it('only treats the explicit true value as collapsed', () => {
    expect(parseStoredSidebarCollapsed('true')).toBe(true)
    expect(parseStoredSidebarCollapsed('false')).toBe(false)
    expect(parseStoredSidebarCollapsed(null)).toBe(false)
  })
})
