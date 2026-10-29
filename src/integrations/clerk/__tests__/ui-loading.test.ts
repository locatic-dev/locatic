import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

it.each(['/', '/sign-in', '/sign-in/sso-callback', '/home'])(
  'captures the document-entry UI mode for %s',
  async (pathname) => {
    vi.stubGlobal('window', { location: { pathname } })
    const { authUiNeedsDocumentReload, shouldPrefetchClerkUi } =
      await import('../ui-loading')
    expect(shouldPrefetchClerkUi(pathname)).toBe(pathname !== '/')
    expect(authUiNeedsDocumentReload()).toBe(pathname === '/')
    window.location.pathname = '/sign-in'
    expect(authUiNeedsDocumentReload()).toBe(pathname === '/')
  },
)

it('does not request a browser document reload during SSR', async () => {
  const { authUiNeedsDocumentReload } = await import('../ui-loading')
  expect(authUiNeedsDocumentReload()).toBe(false)
})
