import { isUsableEmailAddress } from './email_address'
import type { Doc } from './types'

export type EmailCategory = 'product_updates' | 'weekly_digest'
export type SkipReason = 'inactive' | 'unverified' | 'unsubscribed'

export function categoryForKind(
  kind: 'announcement' | 'digest',
): EmailCategory {
  return kind === 'digest' ? 'weekly_digest' : 'product_updates'
}

export function isSubscribed(user: Doc<'users'>, category: EmailCategory) {
  return category === 'weekly_digest'
    ? user.notificationPrefs.weeklyDigest
    : (user.notificationPrefs.productUpdates ?? true)
}

/** Why a user gets no campaign email in this category, or null if they do. */
export function getSkipReason(
  user: Doc<'users'>,
  category: EmailCategory,
): SkipReason | null {
  // Nullish checks: `purgeAfter` is optional and absent on older users.
  if (
    user.deletedAt != null ||
    user.deactivatedAt != null ||
    user.purgeAfter != null
  ) {
    return 'inactive'
  }
  if (user.emailVerified !== true || !isUsableEmailAddress(user.email)) {
    return 'unverified'
  }
  if (!isSubscribed(user, category)) return 'unsubscribed'
  return null
}
