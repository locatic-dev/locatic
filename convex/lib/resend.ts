import { type EmailId, Resend } from '@convex-dev/resend'

import { components, internal } from '../_generated/api'
import type { MutationCtx } from '../_generated/server'
import { isLiveDelivery } from './email_provider'

// Built per call so tests and env changes take effect without module reloads.
export function getResend() {
  return new Resend(components.resend, {
    testMode: !isLiveDelivery(),
    onEmailEvent: internal.emailSends.handleEmailEvent,
  })
}

/**
 * Cancels a component email that Resend has not accepted yet. Reads first:
 * the component's cancelEmail throws for anything past `queued`, and a throw
 * would fail the caller. Returns whether it cancelled.
 */
export async function cancelIfWaiting(
  ctx: MutationCtx,
  emailId: string,
): Promise<boolean> {
  const resend = getResend()
  const status = await resend.status(ctx, emailId as EmailId)
  if (status?.status !== 'waiting' && status?.status !== 'queued') return false
  await resend.cancelEmail(ctx, emailId as EmailId)
  return true
}
