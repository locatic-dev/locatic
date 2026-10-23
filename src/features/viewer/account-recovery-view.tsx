import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { getActionErrorMessage } from '@/lib/action-error'
import type { AccountRecoveryState } from './lifecycle'

export function AccountRecoveryView({
  state,
  onRestore,
  onSignOut,
}: {
  state: AccountRecoveryState
  onRestore: () => Promise<void>
  onSignOut: () => void
}) {
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expiredDeadline, setExpiredDeadline] = useState<number | null>(null)
  const canRestore =
    state.canRestore &&
    state.purgeAfter != null &&
    expiredDeadline !== state.purgeAfter

  // Hydrate the server's eligibility snapshot first. Update against the clock
  // only after mounting, including deadlines that passed while HTML was in flight.
  useEffect(() => {
    const deadline = state.purgeAfter
    if (!state.canRestore || deadline == null) return
    let timer: ReturnType<typeof setTimeout>
    const checkExpiry = () => {
      const remaining = deadline - Date.now()
      if (remaining <= 0) setExpiredDeadline(deadline)
      else timer = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647))
    }
    checkExpiry()
    return () => clearTimeout(timer)
  }, [state.canRestore, state.purgeAfter])

  async function restore() {
    if (!canRestore || restoring) return
    if (state.purgeAfter == null || state.purgeAfter <= Date.now()) {
      setExpiredDeadline(state.purgeAfter)
      return
    }
    setRestoring(true)
    setError(null)
    try {
      await onRestore()
    } catch (cause) {
      setError(getActionErrorMessage(cause))
    } finally {
      setRestoring(false)
    }
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="lx-page-width-form flex min-h-dvh flex-col justify-center gap-6 bg-canvas px-5 py-8"
    >
      <Logo size={28} />
      <div className="flex flex-col gap-3">
        <h1 className="m-0 text-headline text-text">
          {canRestore
            ? 'account scheduled for deletion'
            : 'account unavailable'}
        </h1>
        <p className="m-0 font-sans text-body leading-relaxed text-text-muted">
          {canRestore
            ? 'Your profile is hidden. Restore your account to use Locatic again before the deletion window ends.'
            : state.status === 'purged'
              ? 'This Locatic account has been deleted and cannot be restored.'
              : 'The restoration window has ended. Your account is unavailable while its data is removed.'}
        </p>
        {canRestore && state.purgeAfter != null && (
          <p className="m-0 font-sans text-body text-text">
            Restore before{' '}
            <time dateTime={new Date(state.purgeAfter).toISOString()}>
              {new Date(state.purgeAfter).toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                timeZoneName: 'short',
                timeZone: 'UTC',
              })}
            </time>
            .
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="m-0 font-sans text-body text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {canRestore && (
          <Button
            variant="primary"
            size="touch"
            disabled={restoring}
            onClick={() => void restore()}
          >
            {restoring ? 'restoring…' : 'restore account'}
          </Button>
        )}
        <Button size="touch" disabled={restoring} onClick={onSignOut}>
          sign out
        </Button>
      </div>
    </main>
  )
}
