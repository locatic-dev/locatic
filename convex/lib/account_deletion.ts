export const ACCOUNT_PURGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export type AccountDeletionState = {
  deletedAt?: number | null
  deactivatedAt?: number | null
  purgeAfter?: number | null
  purgedAt?: number | null
}

export function getAccountDeletionWindow(
  state: AccountDeletionState,
  now: number,
) {
  const deletedAt = state.deletedAt ?? now
  const deactivatedAt = state.deactivatedAt ?? now

  return {
    deletedAt,
    deactivatedAt,
    purgeAfter: state.purgeAfter ?? deletedAt + ACCOUNT_PURGE_RETENTION_MS,
  }
}

export function shouldPurgeDeletedAccount(
  state: AccountDeletionState,
  now: number,
) {
  return Boolean(
    state.deletedAt &&
    state.purgeAfter &&
    state.purgeAfter <= now &&
    !state.purgedAt,
  )
}
