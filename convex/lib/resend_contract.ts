export type ReconciledBroadcastStage =
  | 'ready'
  | 'accepted'
  | 'cancelled'
  | 'needs_attention'

export function reconcileBroadcastStatus(
  status: unknown,
): ReconciledBroadcastStage {
  switch (status) {
    case 'draft':
      return 'ready'
    case 'scheduled':
    case 'queued':
    case 'sent':
      return 'accepted'
    case 'canceled':
      return 'cancelled'
    default:
      return 'needs_attention'
  }
}

export function isKnownResendEmailEvent(type: unknown): type is string {
  return (
    typeof type === 'string' &&
    [
      'email.sent',
      'email.delivered',
      'email.delivery_delayed',
      'email.bounced',
      'email.complained',
      'email.failed',
      'email.suppressed',
    ].includes(type)
  )
}
