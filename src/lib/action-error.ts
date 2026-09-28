import { ConvexError } from 'convex/values'
import { toast } from 'sonner'
import { isDiagnosticErrorMode } from '@/lib/error-display'

export const GENERIC_ACTION_ERROR_MESSAGE = 'something went wrong. try again.'

const MAX_MESSAGE_LENGTH = 160
const RATE_LIMIT_PATTERN = /^too many requests\.?(?:\s*try again in (\d+)s)?/i
const PIN_CAP_PATTERN = /^you can pin at most/i

export interface ReportActionErrorOptions {
  /** Short lowercase summary of what failed, e.g. "couldn't follow". */
  title?: string
  /** Overrides the reason derived from the error. */
  description?: string
  /** Re-runs the action; only pass it for actions that are safe to repeat. */
  retry?: () => void | Promise<void>
}

/**
 * Returns copy that is safe to show a user for a failed action: the message a
 * Convex function threw deliberately (with rate limits and the pin cap mapped
 * to specific copy), or a generic line. Transport errors, stack traces and
 * request ids are never surfaced.
 */
export function getActionErrorMessage(error: unknown): string {
  if (!(error instanceof ConvexError)) {
    return GENERIC_ACTION_ERROR_MESSAGE
  }

  const data: unknown = error.data
  if (isRecord(data) && data.kind === 'RateLimited') {
    return 'slow down. try again in a moment.'
  }

  const message = readDataMessage(data)
  if (!message) {
    return GENERIC_ACTION_ERROR_MESSAGE
  }

  const rateLimit = RATE_LIMIT_PATTERN.exec(message)
  if (rateLimit) {
    return rateLimit[1]
      ? `slow down. try again in ${rateLimit[1]}s.`
      : 'slow down. try again in a moment.'
  }

  if (PIN_CAP_PATTERN.test(message)) {
    return 'you can pin up to three projects. unpin one first.'
  }

  return toTerminalVoice(message)
}

/** Shows a toast for a brief action failure (like, follow, pin, DM open). */
export function reportActionError(
  error: unknown,
  options: ReportActionErrorOptions = {},
) {
  if (isDiagnosticErrorMode()) {
    console.error(error)
  }

  const reason = getActionErrorMessage(error)
  const { description, retry, title } = options
  const detail =
    description ??
    (title && reason !== GENERIC_ACTION_ERROR_MESSAGE ? reason : undefined)

  toast.error(title ?? reason, {
    description: detail,
    action: retry
      ? {
          label: 'retry',
          onClick: () => {
            void retry()
          },
        }
      : undefined,
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readDataMessage(data: unknown) {
  const raw =
    typeof data === 'string'
      ? data
      : isRecord(data) && typeof data.message === 'string'
        ? data.message
        : ''
  const firstLine = raw.split('\n')[0]?.trim() ?? ''

  return firstLine.length > MAX_MESSAGE_LENGTH ? '' : firstLine
}

// Lowercase a leading capital unless the first word is a proper noun such as
// "GitHub", matching the product's lowercase voice.
function toTerminalVoice(message: string) {
  const firstWord = message.split(/\s/)[0] ?? ''
  if (/[A-Z]/.test(firstWord.slice(1))) {
    return message
  }

  return message.charAt(0).toLowerCase() + message.slice(1)
}
