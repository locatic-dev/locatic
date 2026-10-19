import { Resend } from '@convex-dev/resend'

import { components, internal } from '../_generated/api'
import { isLiveDelivery } from './email_provider'

// Built per call so tests and env changes take effect without module reloads.
export function getResend() {
  return new Resend(components.resend, {
    testMode: !isLiveDelivery(),
    onEmailEvent: internal.emailSends.handleEmailEvent,
  })
}
