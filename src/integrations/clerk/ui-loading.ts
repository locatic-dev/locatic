/** Only the landing entry skips Clerk's prebuilt UI; session hooks still load. */
export function shouldPrefetchClerkUi(pathname: string): boolean {
  return pathname !== '/'
}

// Clerk chooses headless/UI mode once per document. Enabling prefetch later
// cannot upgrade an already-loaded headless instance to mount SignIn.
const skippedUiAtEntry =
  typeof window !== 'undefined' &&
  !shouldPrefetchClerkUi(window.location.pathname)

export function authUiNeedsDocumentReload(): boolean {
  return skippedUiAtEntry
}
