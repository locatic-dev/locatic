import type { ViewerBootstrapPayload } from '@/features/contracts'

export function getAccountRecoveryState(
  bootstrap:
    | Pick<ViewerBootstrapPayload, 'status' | 'accountLifecycle'>
    | undefined,
) {
  const status = bootstrap?.status
  if (
    status !== 'deletion_pending' &&
    status !== 'deletion_expired' &&
    status !== 'purged'
  ) {
    return null
  }
  return {
    status,
    canRestore:
      status === 'deletion_pending' &&
      bootstrap?.accountLifecycle?.canRestore === true,
    purgeAfter: bootstrap?.accountLifecycle?.purgeAfter ?? null,
  }
}

export type AccountRecoveryState = NonNullable<
  ReturnType<typeof getAccountRecoveryState>
>
