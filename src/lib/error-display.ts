export interface UserFacingErrorCopy {
  title: string
  description: string
  detail: string | null
}

const GENERIC_ERROR_TITLE = "couldn't load this page."
const GENERIC_ERROR_DESCRIPTION =
  'retry, or go home and try again in a moment. if it keeps happening, sign out and back in.'
const AUTH_CONFIG_ERROR_TITLE = 'your session is still syncing.'
const AUTH_CONFIG_ERROR_DESCRIPTION =
  'locatic reached your session before its token finished syncing. retry in a moment; a refresh usually clears it.'
const UNKNOWN_ERROR_MESSAGE = 'Something went wrong while loading this page.'

export function isDiagnosticErrorMode() {
  return import.meta.env.MODE === 'development'
}

export function getUserFacingErrorCopy(error: unknown): UserFacingErrorCopy {
  const message = getErrorMessage(error)
  const isAuthConfigError = isAuthConfigurationError(message)
  const showDiagnosticDetail = isDiagnosticErrorMode()

  if (isAuthConfigError) {
    return {
      title: AUTH_CONFIG_ERROR_TITLE,
      description: AUTH_CONFIG_ERROR_DESCRIPTION,
      detail: showDiagnosticDetail ? message : null,
    }
  }

  return {
    title: GENERIC_ERROR_TITLE,
    description: GENERIC_ERROR_DESCRIPTION,
    detail: showDiagnosticDetail ? message : null,
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
