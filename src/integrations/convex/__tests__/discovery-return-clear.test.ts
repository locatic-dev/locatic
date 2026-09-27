// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { consumeDiscoveryReturn, rememberDiscoveryReturn } from '../metrics'

const NOW = Date.UTC(2026, 8, 1, 12)
const MINUTE = 60 * 1000

describe('discovery return marker', () => {
  afterEach(() => {
    window.sessionStorage.clear()
  })

  it('is cleared when the signed-in user lands on Home instead of the destination', () => {
    rememberDiscoveryReturn('/u/ada', NOW)

    expect(consumeDiscoveryReturn('/home', NOW + MINUTE)).toBe(false)
    // A later, unrelated visit to the page is not a sign-in return.
    expect(consumeDiscoveryReturn('/u/ada', NOW + 5 * MINUTE)).toBe(false)
  })

  it('is cleared on any other non-discovery page', () => {
    rememberDiscoveryReturn('/explore', NOW)

    expect(consumeDiscoveryReturn('/settings', NOW + MINUTE)).toBe(false)
    expect(consumeDiscoveryReturn('/explore', NOW + 2 * MINUTE)).toBe(false)
  })

  it('survives the sign-in, sso-callback and onboarding steps on the way back', () => {
    rememberDiscoveryReturn('/c/berlin', NOW)

    expect(consumeDiscoveryReturn('/sign-in/sso-callback', NOW)).toBe(false)
    expect(consumeDiscoveryReturn('/onboarding', NOW + MINUTE)).toBe(false)
    expect(consumeDiscoveryReturn('/c/berlin', NOW + 2 * MINUTE)).toBe(true)
  })

  it('survives a detour through another discovery page', () => {
    rememberDiscoveryReturn('/c/berlin', NOW)

    expect(consumeDiscoveryReturn('/explore', NOW + MINUTE)).toBe(false)
    expect(consumeDiscoveryReturn('/c/berlin', NOW + 2 * MINUTE)).toBe(true)
  })
})
