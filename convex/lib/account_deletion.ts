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

/**
 * Deactivation to keep when a pending deletion is cancelled.
 *
 * Requests made before `deletionPreviousDeactivatedAt` existed stamped
 * `deactivatedAt` at deletion unless the account was already deactivated,
 * and a deactivation in the same millisecond stores the same shape, so their
 * history is unknowable. Those restore hidden: reopening a profile the member
 * may have hidden is worse than keeping one hidden.
 */
export function getDeactivationBeforeDeletion(
  state: AccountDeletionState & {
    deletionPreviousDeactivatedAt?: number | null
  },
): number | null {
  if (state.deletionPreviousDeactivatedAt !== undefined)
    return state.deletionPreviousDeactivatedAt
  return state.deactivatedAt ?? null
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
