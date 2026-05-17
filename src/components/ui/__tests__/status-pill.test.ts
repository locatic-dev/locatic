import { describe, it, expect } from 'vitest'
import { BUILD_STATUS } from '../status-pill'

describe('BUILD_STATUS', () => {
  it('has all five required statuses', () => {
    const keys = Object.keys(BUILD_STATUS)
    expect(keys).toContain('building_solo')
    expect(keys).toContain('looking_for_cofounder')
    expect(keys).toContain('open_to_collab')
    expect(keys).toContain('hiring')
    expect(keys).toContain('just_exploring')
  })

  it('each status has a label', () => {
    for (const [, meta] of Object.entries(BUILD_STATUS)) {
      expect(meta.label).toBeTruthy()
      expect(typeof meta.label).toBe('string')
    }
  })

  it('building_solo has a hue', () => {
    expect(BUILD_STATUS.building_solo.hue).toBe(200)
  })

  it('open_to_collab is marked as accent', () => {
    expect(BUILD_STATUS.open_to_collab.accent).toBe(true)
  })
})
