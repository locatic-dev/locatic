export type WebhookEventStatus =
  | 'processing'
  | 'processed'
  | 'ignored'
  | 'failed'

export type WebhookEventRecord = {
  status: WebhookEventStatus
  receivedAt: number
}

const PROCESSING_RETRY_AFTER_MS = 10 * 60 * 1000

const SKIP_STATUSES = new Set<WebhookEventStatus>(['processed', 'ignored'])

export function getWebhookProcessingDecision(
  events: WebhookEventRecord[],
  now: number,
): {
  shouldProcess: boolean
  status: WebhookEventStatus
} {
  const alreadyHandled = events.find((event) => SKIP_STATUSES.has(event.status))
  if (alreadyHandled) {
    return {
      shouldProcess: false,
      status: alreadyHandled.status,
    }
  }

  const activeProcessing = events.find(
    (event) =>
      event.status === 'processing' &&
      now - event.receivedAt < PROCESSING_RETRY_AFTER_MS,
  )
  if (activeProcessing) {
    return {
      shouldProcess: false,
      status: 'processing',
    }
  }

  return {
    shouldProcess: true,
    status: 'processing',
  }
}

export function compactWebhookError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 500)
}
