import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getActionErrorMessage } from '@/lib/action-error'
import { AlertTriangle, Loader2 } from '@/lib/icons'
import { useDeactivateAccount, useDeleteAccount } from './mutations'

// Danger-zone actions live behind in-app confirmation dialogs rather than the
// browser's native confirm/prompt — the native dialogs can't be styled, read as
// generic, and (for confirm) can't hold a typed acknowledgement. Deactivation
// uses a single acknowledgement; permanent deletion keeps the type-DELETE gate.
export function AccountDangerZone() {
  const deactivate = useDeactivateAccount()
  const deleteAccount = useDeleteAccount()

  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deactivateError, setDeactivateError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')

  const canDelete = confirmText.trim() === 'DELETE'

  const handleDeactivate = async () => {
    setDeactivating(true)
    setDeactivateError(null)
    try {
      await deactivate({})
      setDeactivateOpen(false)
    } catch (error) {
      console.error(error)
      setDeactivateError(getActionErrorMessage(error))
    } finally {
      setDeactivating(false)
    }
  }

  const handleDelete = async () => {
    if (!canDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteAccount({})
      setDeleteOpen(false)
    } catch (error) {
      console.error(error)
      setDeleteError(getActionErrorMessage(error))
    } finally {
      setDeleting(false)
    }
  }

  const resetDelete = (open: boolean) => {
    setDeleteOpen(open)
    if (!open) {
      setConfirmText('')
      setDeleteError(null)
    }
  }

  return (
    <div className="flex max-w-140 flex-col gap-5">
      {/* Deactivate */}
      <div className="rounded-card border border-line bg-surface p-5">
        <div className="mb-2 text-title text-text">deactivate account</div>
        <p className="mb-3.5 mt-0 font-sans text-body leading-normal text-text-muted">
          hides your profile from Explore and public surfaces without deleting
          your account data.
        </p>
        <Button
          size="touch"
          onClick={() => {
            setDeactivateError(null)
            setDeactivateOpen(true)
          }}
        >
          deactivate account
        </Button>
      </div>

      {/* Delete — irreversible */}
      <div className="rounded-card border border-danger/40 bg-danger/4 p-5">
        <div className="mb-2 text-title text-danger">delete account</div>
        <p className="mb-3.5 mt-0 font-sans text-body leading-normal text-text-muted">
          permanently removes all your Locatic data. this cannot be undone.
        </p>
        <Button variant="danger" size="touch" onClick={() => resetDelete(true)}>
          delete account permanently
        </Button>
      </div>

      {/* Deactivate confirmation */}
      <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>deactivate your account?</DialogTitle>
            <DialogDescription>
              Your profile disappears from Explore and public surfaces right
              away. This does not delete your account data.
            </DialogDescription>
          </DialogHeader>
          {deactivateError && (
            <p role="alert" className="m-0 font-mono text-label text-danger">
              {deactivateError}
            </p>
          )}
          <DialogFooter>
            <Button
              size="touch"
              disabled={deactivating}
              onClick={() => setDeactivateOpen(false)}
            >
              cancel
            </Button>
            <Button
              size="touch"
              disabled={deactivating}
              onClick={() => void handleDeactivate()}
            >
              {deactivating && (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              )}
              {deactivating ? 'deactivating' : 'deactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation — type DELETE */}
      <Dialog open={deleteOpen} onOpenChange={resetDelete}>
        <DialogContent className="border-danger/40">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-danger">
              <AlertTriangle size={16} aria-hidden />
              delete account permanently
            </DialogTitle>
            <DialogDescription>
              This erases all of your Locatic data and cannot be undone. Type{' '}
              <span className="font-mono font-semibold text-text">DELETE</span>{' '}
              to confirm.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label htmlFor="confirm-delete" className="sr-only">
              Type DELETE to confirm
            </label>
            <Input
              id="confirm-delete"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canDelete && !deleting) {
                  void handleDelete()
                }
              }}
              autoComplete="off"
              placeholder="DELETE"
              className="font-mono"
              aria-invalid={confirmText.length > 0 && !canDelete}
            />
          </div>
          {deleteError && (
            <p role="alert" className="m-0 font-mono text-label text-danger">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button
              size="touch"
              disabled={deleting}
              onClick={() => resetDelete(false)}
            >
              cancel
            </Button>
            <Button
              variant="danger"
              size="touch"
              disabled={!canDelete || deleting}
              onClick={() => void handleDelete()}
            >
              {deleting && (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              )}
              {deleting ? 'deleting' : 'delete permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
