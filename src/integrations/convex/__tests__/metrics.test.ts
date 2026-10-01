// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import {
  consumeDiscoveryReturn,
  discoveryReturnPath,
  rememberDiscoveryReturn,
} from '../metrics'

const NOW = Date.UTC(2026, 8, 1, 12)
const MINUTE = 60 * 1000

describe('discovery sign-in return', () => {
  afterEach(() => {
    window.sessionStorage.clear()
  })

  it('treats public Explore, profiles, city and project pages as discovery', () => {
    expect(discoveryReturnPath('/explore?mode=builders#top')).toBe('/explore')
    expect(discoveryReturnPath('/u/ada')).toBe('/u/ada')
    expect(discoveryReturnPath('/c/bengaluru')).toBe('/c/bengaluru')
    expect(discoveryReturnPath('/project/ada/mapkit')).toBe(
      '/project/ada/mapkit',
    )
    expect(discoveryReturnPath('/home')).toBeNull()
    expect(discoveryReturnPath('/explorer')).toBeNull()
    expect(discoveryReturnPath(null)).toBeNull()
  })

  it('counts once when the signed-in session reaches the remembered page', () => {
    rememberDiscoveryReturn('/u/ada?tab=projects', NOW)

    expect(consumeDiscoveryReturn('/onboarding', NOW + MINUTE)).toBe(false)
    expect(consumeDiscoveryReturn('/u/ada', NOW + 2 * MINUTE)).toBe(true)
    expect(consumeDiscoveryReturn('/u/ada', NOW + 3 * MINUTE)).toBe(false)
  })

  it('does not remember non-discovery destinations', () => {
    rememberDiscoveryReturn('/settings', NOW)

    expect(consumeDiscoveryReturn('/settings', NOW)).toBe(false)
  })

  it('drops a stale marker instead of counting it', () => {
    rememberDiscoveryReturn('/explore', NOW)

    expect(consumeDiscoveryReturn('/explore', NOW + 31 * MINUTE)).toBe(false)
    rememberDiscoveryReturn('/explore', NOW + 32 * MINUTE)
    expect(consumeDiscoveryReturn('/explore', NOW + 33 * MINUTE)).toBe(true)
  })
})
