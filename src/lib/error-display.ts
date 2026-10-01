export interface UserFacingErrorCopy {
  title: string
  description: string
  detail: string | null
  /**
   * The page's primary control: retry the load, or sign in again. `sign-in`
   * still offers retry as a secondary control: Clerk can hold a live session
   * while Convex rejects the token, and the sign-in route then redirects
   * straight back, so sign-in alone would loop.
   */
  action: 'retry' | 'sign-in'
}

const GENERIC_ERROR_TITLE = "couldn't load this page."
const GENERIC_ERROR_DESCRIPTION =
  'retry, or go home and try again in a moment. if it keeps happening, sign out and back in.'
const AUTH_CONFIG_ERROR_TITLE = 'your session is still syncing.'
const AUTH_CONFIG_ERROR_DESCRIPTION =
  'locatic reached your session before its token finished syncing. retry in a moment; a refresh usually clears it.'
const SESSION_ENDED_TITLE = 'your session ended.'
const SESSION_ENDED_DESCRIPTION =
  'sign in again to pick up where you left off, or retry if you are still signed in.'
const UNKNOWN_ERROR_MESSAGE = 'Something went wrong while loading this page.'

/**
 * Raw error text only when Vite's `DEV` flag is set, as under `vite dev`. `DEV`
 * follows NODE_ENV, not `--mode`, so production builds hide it: `vite build`
 * sets NODE_ENV=production (whatever its --mode) unless NODE_ENV is overridden.
 */
export function isDiagnosticErrorMode() {
  return import.meta.env.DEV
}

export function getUserFacingErrorCopy(error: unknown): UserFacingErrorCopy {
  const message = getErrorMessage(error)
  const isAuthConfigError = isAuthConfigurationError(message)
  const showDiagnosticDetail = isDiagnosticErrorMode()

  if (isUnauthorizedError(error, message)) {
    return {
      title: SESSION_ENDED_TITLE,
      description: SESSION_ENDED_DESCRIPTION,
      detail: showDiagnosticDetail ? message : null,
      action: 'sign-in',
    }
  }

  if (isAuthConfigError) {
    return {
      title: AUTH_CONFIG_ERROR_TITLE,
      description: AUTH_CONFIG_ERROR_DESCRIPTION,
      detail: showDiagnosticDetail ? message : null,
      action: 'retry',
    }
  }

  return {
    title: GENERIC_ERROR_TITLE,
    description: GENERIC_ERROR_DESCRIPTION,
    detail: showDiagnosticDetail ? message : null,
    action: 'retry',
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message || UNKNOWN_ERROR_MESSAGE
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return UNKNOWN_ERROR_MESSAGE
}

function isAuthConfigurationError(message: string) {
  return (
    message.includes('NoAuthProvider') ||
    message.includes('issuer and audience match')
  )
}

// `requireIdentity` and `getViewerOrThrow` throw `ConvexError('Unauthorized')`.
// Duck-typed rather than `instanceof ConvexError`, which would pull
// `convex/values` into the entry.
function isUnauthorizedError(error: unknown, message: string) {
  return (
    (error as { data?: unknown } | null)?.data === 'Unauthorized' ||
    /\bUnauthorized\b/.test(message)
  )
}
