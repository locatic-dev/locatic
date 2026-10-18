import { describe, expect, it } from 'vitest'
import { isCityIndexable, isProfileIndexable } from '../seo_thresholds'

describe('seo thresholds', () => {
  it('indexes cities from three counted builders', () => {
    expect(isCityIndexable({ builderCount: 0 })).toBe(false)
    expect(isCityIndexable({ builderCount: 2 })).toBe(false)
    expect(isCityIndexable({ builderCount: 3 })).toBe(true)
  })

  it('indexes profiles with at least one visible project', () => {
    expect(isProfileIndexable({ projectsCount: 0 })).toBe(false)
    expect(isProfileIndexable({ projectsCount: 1 })).toBe(true)
  })
})
