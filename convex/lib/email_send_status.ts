import type { Doc } from './types'

export type SendStatus = Doc<'email_sends'>['status']

const RANK: Partial<Record<SendStatus, number>> = {
  queued: 0,
  sent: 1,
  delivered: 2,
}

const TERMINAL = new Set<SendStatus>([
  'bounced',
  'complained',
  'failed',
  'cancelled',
])

/**
 * Forward-only precedence: queued < sent < delivered, and bounced,
 * complained, failed and cancelled are terminal. Returns the new status, or
 * null when the incoming one must not overwrite the current one (a late
 * `delivered` never overwrites `complained`). `delivered` may still move to
 * `bounced` or `complained`.
 */
export function nextSendStatus(
  current: SendStatus,
  incoming: SendStatus,
): SendStatus | null {
  if (TERMINAL.has(current)) return null
  if (TERMINAL.has(incoming)) return incoming
  return (RANK[incoming] ?? -1) > (RANK[current] ?? -1) ? incoming : null
}

export function statusFromEvent(type: string): SendStatus | null {
  switch (type) {
    case 'email.sent':
      return 'sent'
    case 'email.delivered':
      return 'delivered'
    case 'email.bounced':
      return 'bounced'
    case 'email.complained':
      return 'complained'
    case 'email.failed':
      return 'failed'
    default:
      return null
  }
}

/**
 * Shares `limit` slots between two oldest-first lists: half each, and any
 * slots one list cannot use go to the other.
 */
export function pickReconcileRows<T>(first: T[], second: T[], limit: number) {
  const half = Math.floor(limit / 2)
  const fromFirst = Math.min(
    first.length,
    Math.max(half, limit - second.length),
  )
  const fromSecond = Math.min(second.length, limit - fromFirst)
  return [...first.slice(0, fromFirst), ...second.slice(0, fromSecond)]
}
