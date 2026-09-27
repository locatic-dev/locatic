/** Accounts younger than this read as new builders (plan item D4). */
export const NEW_BUILDER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

/**
 * True for an account created less than 30 days before `now`. Builders with
 * no public work sort after active builders, newest accounts first, and carry
 * a "new builder" label so a fresh account reads as new rather than inactive.
 */
export function isNewBuilder(createdAt: number, now: number): boolean {
  // A creation time ahead of a skewed client clock is still a new account.
  return now - createdAt < NEW_BUILDER_WINDOW_MS
}
