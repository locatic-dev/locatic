export interface UserFacingErrorCopy {
  title: string
  description: string
  detail: string | null
}

const GENERIC_ERROR_TITLE = 'Something interrupted this page'
const GENERIC_ERROR_DESCRIPTION =
  'Retry the request. If it keeps happening, sign in again or return home.'
const AUTH_CONFIG_ERROR_TITLE = 'Authentication needs one more sync'
const AUTH_CONFIG_ERROR_DESCRIPTION =
  'Locatic reached your session, but the token used for this request was still syncing. Retrying after refresh usually clears it once auth finishes syncing.'
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
