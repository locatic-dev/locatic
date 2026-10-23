export const ACCOUNT_PURGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export type AccountDeletionState = {
  deletedAt?: number | null
  deactivatedAt?: number | null
  purgeAfter?: number | null
  purgedAt?: number | null
}

export function isAccountDeleted(state: AccountDeletionState) {
  return state.deletedAt != null || state.purgedAt != null
}

export function getAccountLifecycle(state: AccountDeletionState, now: number) {
  if (state.purgedAt != null) return 'purged' as const
  if (state.deletedAt == null) return 'active' as const
  return state.purgeAfter != null && now < state.purgeAfter
    ? ('deletion_pending' as const)
    : ('deletion_expired' as const)
}

/** Irreversible deletion: do not create new copies of this account's data. */
export function isAccountPastRestorationWindow(
  state: AccountDeletionState,
  now: number,
) {
  const lifecycle = getAccountLifecycle(state, now)
  return lifecycle === 'deletion_expired' || lifecycle === 'purged'
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
    state.deletedAt != null &&
    state.purgeAfter != null &&
    state.purgeAfter <= now &&
    state.purgedAt == null,
  )
}
