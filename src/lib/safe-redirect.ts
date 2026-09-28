/**
 * Post-authentication destination contract.
 *
 * A destination travels between auth boundaries as the `redirect` search
 * parameter. It is accepted only as a same-origin relative URL (path, query
 * and hash) and never as an auth route, so it cannot send a user off-site or
 * back into sign-in, sign-up or onboarding.
 */

export type AuthDestinationSearch = {
  redirect?: string
}

const MAX_DESTINATION_LENGTH = 2048
const MAX_DECODE_PASSES = 3
// Resolving against a fixed origin lets the URL parser apply the browser's
// normalisation (dot segments, backslashes, stripped tabs) before the origin
// check. The value never leaves this module.
const PARSE_BASE_ORIGIN = 'https://destination.locatic.invalid'
const AUTH_ROUTE_PREFIXES = ['/sign-in', '/sign-up', '/onboarding']

// ASCII control characters (including tab, CR and LF) and DEL.
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) {
      return true
    }
  }

  return false
}

function decodeRepeatedly(value: string): string | null {
  let decoded = value

  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    let next: string
    try {
      next = decodeURIComponent(decoded)
    } catch {
      return null
    }

    if (next === decoded) {
      return decoded
    }

    decoded = next
  }

  return decoded
}

function isAuthRoutePath(pathname: string): boolean {
  const normalized = pathname.toLowerCase().replace(/\/+$/, '')

  return AUTH_ROUTE_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  )
}

/**
 * Returns the input as a same-origin relative URL (pathname, query and hash
 * preserved), or null when it could leave the origin, is malformed, or points
 * at an auth route.
 */
export function toSafeRelativeUrl(input: string): string | null {
  if (
    input.length === 0 ||
    input.length > MAX_DESTINATION_LENGTH ||
    !input.startsWith('/') ||
    input.startsWith('//') ||
    input.includes('\\') ||
    hasControlCharacter(input)
  ) {
    return null
  }

  let url: URL
  try {
    url = new URL(input, PARSE_BASE_ORIGIN)
  } catch {
    return null
  }

  if (url.origin !== PARSE_BASE_ORIGIN) {
    return null
  }

  // Encoded slashes, backslashes or control characters in the path can turn
  // into a protocol-relative URL once a router or proxy decodes them.
  const decodedPathname = decodeRepeatedly(url.pathname)
  if (
    decodedPathname === null ||
    decodedPathname.startsWith('//') ||
    decodedPathname.includes('\\') ||
    hasControlCharacter(decodedPathname) ||
    isAuthRoutePath(decodedPathname)
  ) {
    return null
  }

  return `${url.pathname}${url.search}${url.hash}`
}

/** Reads and sanitises the `redirect` search parameter. */
export function safeRedirectFromSearch(search: {
  redirect?: unknown
}): string | null {
  return typeof search.redirect === 'string'
    ? toSafeRelativeUrl(search.redirect)
    : null
}

/**
 * `validateSearch` for routes that accept a post-auth destination. Unsafe
 * values are dropped instead of failing the route.
 *
 * The key is always present: TanStack Router builds a route's search as
 * `{ ...parentSearch, ...validated }`, so leaving `redirect` out would let
 * the raw, unsafe value through from the URL.
 */
export function validateAuthDestinationSearch(
  search: Record<string, unknown>,
): AuthDestinationSearch {
  return { redirect: safeRedirectFromSearch(search) ?? undefined }
}

/** The onboarding URL that carries a destination through to completion. */
export function buildOnboardingUrl(destination: string | null): string {
  return destination
    ? `/onboarding?${new URLSearchParams({ redirect: destination }).toString()}`
    : '/onboarding'
}

// Clerk carries its own destination in these parameters, as absolute URLs
// (for example `/sign-in?redirect_url=https://locatic.dev/explore`).
const CLERK_DESTINATION_KEYS = ['redirect_url', 'sign_in_force_redirect_url']

/**
 * Like `toSafeRelativeUrl`, but also accepts an absolute URL on `origin` and
 * returns it as a relative one. Absolute URLs are rejected when the origin is
 * unknown (server render).
 */
export function toSafeRelativeUrlFromAbsolute(
  input: string,
  origin: string | null,
): string | null {
  if (input.startsWith('/')) {
    return toSafeRelativeUrl(input)
  }
  if (!origin) {
    return null
  }

  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }

  return url.origin === origin
    ? toSafeRelativeUrl(`${url.pathname}${url.search}${url.hash}`)
    : null
}

/**
 * The destination for sign-in and sign-up: our own `redirect` parameter
 * first, else a same-origin destination Clerk put in its own parameters.
 */
export function destinationFromAuthSearch(
  search: Record<string, unknown>,
  origin: string | null,
): string | null {
  const own = safeRedirectFromSearch(search)
  if (own) {
    return own
  }

  for (const key of CLERK_DESTINATION_KEYS) {
    const value = search[key]
    const destination =
      typeof value === 'string'
        ? toSafeRelativeUrlFromAbsolute(value, origin)
        : null
    if (destination) {
      return destination
    }
  }

  return null
}

/**
 * `validateSearch` for sign-in and sign-up (see `destinationFromAuthSearch`).
 * Like `validateAuthDestinationSearch`, the `redirect` key is always present
 * so an unsafe raw value cannot survive the router's search merge.
 */
export function validateSignInSearch(
  search: Record<string, unknown>,
): AuthDestinationSearch {
  const origin = typeof window === 'undefined' ? null : window.location.origin

  return { redirect: destinationFromAuthSearch(search, origin) ?? undefined }
}
