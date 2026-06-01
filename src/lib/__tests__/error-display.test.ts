import { afterEach, describe, expect, it, vi } from 'vitest'

import { getUserFacingErrorCopy, isDiagnosticErrorMode } from '../error-display'

describe('error display helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('enables diagnostic details in local dev mode', () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('MODE', 'development')

    expect(isDiagnosticErrorMode()).toBe(true)
  })

  it('enables diagnostic details for the deployed development build mode', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('MODE', 'development')

    expect(isDiagnosticErrorMode()).toBe(true)
  })

  it('hides raw error detail in production mode', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('MODE', 'production')

    const copy = getUserFacingErrorCopy(
      new Error(
        'ConvexError: Viewer not found\n    at users:viewerLikedProjectIds',
      ),
    )

    expect(copy.title).toBe('Something interrupted this page')
    expect(copy.detail).toBeNull()
    expect(copy.description).not.toContain('Viewer not found')
    expect(copy.description).not.toContain('ConvexError')
  })

  it('hides raw error detail in production mode even if Vite DEV is true', () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('MODE', 'production')

    const copy = getUserFacingErrorCopy(
      new Error(
        'ConvexError: Viewer not found\n    at users:viewerLikedProjectIds',
      ),
    )

    expect(isDiagnosticErrorMode()).toBe(false)
    expect(copy.detail).toBeNull()
  })

  it('keeps raw error detail in diagnostic mode', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('MODE', 'development')

    const copy = getUserFacingErrorCopy(new Error('Viewer not found'))

    expect(copy.detail).toBe('Viewer not found')
  })

  it('uses friendly auth config copy without leaking raw detail in production', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('MODE', 'production')

    const copy = getUserFacingErrorCopy(
      new Error('NoAuthProvider: issuer and audience match failed'),
    )

    expect(copy.title).toBe('Authentication needs one more sync')
    expect(copy.description).toContain('Retrying after refresh')
    expect(copy.detail).toBeNull()
  })
})
