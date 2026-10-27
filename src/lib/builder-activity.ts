/** Accounts younger than this read as new builders. */
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

/** Activity newer than this marks a builder as live: avatar ring and dot. */
export const LIVE_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * True for activity inside the last 24 hours. A timestamp more than a minute
 * ahead of `now` is clock skew or bad data, so it does not count as live.
 */
export function isLive(at: number | null | undefined, now: number): boolean {
  return at != null && now - at < LIVE_WINDOW_MS && at <= now + 60_000
}
