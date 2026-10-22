import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { PublicFooter } from '@/components/app-shell/public-footer'
import { PublicHeader } from '@/components/app-shell/public-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useStopAllWithToken, useUnsubscribeWithToken } from './mutations'

type Category = 'product_updates' | 'weekly_digest'

type PageState =
  | { kind: 'ready' }
  | { kind: 'unsubscribed'; category: Category }
  | { kind: 'stopped' }
  | { kind: 'invalid' }

const CATEGORY_NAMES: Record<Category, string> = {
  product_updates: 'Locatic updates',
  weekly_digest: 'the weekly digest',
}

const INVALID_MESSAGE =
  "This link doesn't work. Manage email from Settings after signing in."

function SettingsLink() {
  return (
    <Link
      to="/settings"
      search={{ tab: 'notifications' }}
      className="font-mono text-label text-text-muted underline hover:text-text"
    >
      Manage email in settings
    </Link>
  )
}

/**
 * Confirms an unsubscribe from an email footer link. Opening the page changes
 * nothing (mail scanners prefetch links); only the button does. There is no
 * Undo: a forwarded email must not be able to resubscribe its owner, so
 * resubscribing needs a signed-in visit to Settings.
 */
export function UnsubscribeCard({ token }: { token: string }) {
  const unsubscribe = useUnsubscribeWithToken()
  const stopAll = useStopAllWithToken()
  const [state, setState] = useState<PageState>(
    token ? { kind: 'ready' } : { kind: 'invalid' },
  )
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const submit = async (action: 'one' | 'all') => {
    setBusy(true)
    setFailed(false)
    try {
      const result =
        action === 'one'
          ? await unsubscribe({ token })
          : await stopAll({ token })
      if (result.status === 'invalid') {
        setState({ kind: 'invalid' })
      } else {
        setState(
          action === 'one'
            ? { kind: 'unsubscribed', category: result.category }
            : { kind: 'stopped' },
        )
      }
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card density="cozy" className="space-y-5">
      {state.kind === 'invalid' ? (
        <>
          <h1 className="text-title text-text">Unsubscribe</h1>
          <p role="alert" className="text-body text-text">
            {INVALID_MESSAGE}
          </p>
          <SettingsLink />
        </>
      ) : state.kind === 'ready' ? (
        <>
          <h1 className="text-title text-text">
            {token.split('.')[1] === 'weekly_digest'
              ? 'Stop the weekly digest for this address?'
              : 'Stop Locatic updates for this address?'}
          </h1>
          <p className="text-body text-text-muted">
            You'll stop getting this kind of email from Locatic. You can turn it
            back on in Settings when you're signed in.
          </p>
          {failed ? (
            <p role="alert" className="text-body text-danger">
              That didn't work. Try again.
            </p>
          ) : null}
          <Button
            type="button"
            variant="primary"
            disabled={busy}
            onClick={() => void submit('one')}
          >
            Unsubscribe
          </Button>
        </>
      ) : (
        <>
          <h1 className="text-title text-text">Unsubscribed</h1>
          <p role="status" className="text-body text-text">
            {state.kind === 'stopped'
              ? "You won't get any more Locatic email."
              : `You're unsubscribed from ${CATEGORY_NAMES[state.category]}.`}
          </p>
          {failed ? (
            <p role="alert" className="text-body text-danger">
              That didn't work. Try again.
            </p>
          ) : null}
          {state.kind === 'unsubscribed' ? (
            <Button
              type="button"
              disabled={busy}
              onClick={() => void submit('all')}
            >
              Stop all Locatic email
            </Button>
          ) : null}
          <SettingsLink />
        </>
      )}
    </Card>
  )
}

export function UnsubscribePage({ token }: { token: string }) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-canvas text-text">
      <PublicHeader />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-(--lx-form-max) flex-1 px-(--lx-gutter) py-10 md:py-14"
      >
        <UnsubscribeCard token={token} />
      </main>
      <PublicFooter />
    </div>
  )
}
