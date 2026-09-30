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

  it('hides raw error detail in a deployed development build', () => {
    // `vite build --mode development` keeps DEV false.
    vi.stubEnv('DEV', false)
    vi.stubEnv('MODE', 'development')

    const copy = getUserFacingErrorCopy(new Error('Viewer not found'))

    expect(isDiagnosticErrorMode()).toBe(false)
    expect(copy.detail).toBeNull()
  })

  it('hides raw error detail in production mode', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('MODE', 'production')

    const copy = getUserFacingErrorCopy(
      new Error(
        'ConvexError: Viewer not found\n    at users:viewerLikedProjectIds',
      ),
    )

    expect(copy.title).toBe("couldn't load this page.")
    expect(copy.detail).toBeNull()
    expect(copy.description).not.toContain('Viewer not found')
    expect(copy.description).not.toContain('ConvexError')
  })

  it('shows detail whenever Vite runs the dev server', () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('MODE', 'production')

    expect(isDiagnosticErrorMode()).toBe(true)
  })

  it('keeps raw error detail in diagnostic mode', () => {
    vi.stubEnv('DEV', true)
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

    expect(copy.title).toBe('your session is still syncing.')
    expect(copy.description).toContain('a refresh usually clears it')
    expect(copy.detail).toBeNull()
  })

  it('asks the viewer to sign in again when a query is Unauthorized', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('MODE', 'production')

    const copy = getUserFacingErrorCopy(
      new Error(
        '[CONVEX Q(notifications:list)] [Request ID: 1] Server Error\nUncaught ConvexError: Unauthorized',
      ),
    )

    expect(copy).toEqual({
      title: 'your session ended.',
      description:
        'sign in again to pick up where you left off, or retry if you are still signed in.',
      detail: null,
      action: 'sign-in',
    })
  })

  it('recognises a ConvexError whose data is Unauthorized', () => {
    vi.stubEnv('DEV', false)

    const error = Object.assign(new Error('ConvexError'), {
      data: 'Unauthorized',
    })

    expect(getUserFacingErrorCopy(error).action).toBe('sign-in')
  })

  it('offers a retry for every other error', () => {
    vi.stubEnv('DEV', false)

    expect(getUserFacingErrorCopy(new Error('Viewer not found')).action).toBe(
      'retry',
    )
    expect(
      getUserFacingErrorCopy(new Error('NoAuthProvider: token')).action,
    ).toBe('retry')
    expect(
      getUserFacingErrorCopy(new Error('UnauthorizedAccessLog missing')).action,
    ).toBe('retry')
  })
})
