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
import { AlertTriangle, Loader2 } from '@/lib/icons'
import { useDeactivateAccount, useDeleteAccount } from './mutations'

// Danger-zone actions live behind in-app confirmation dialogs rather than the
// browser's native confirm/prompt — the native dialogs can't be styled, read as
// generic, and (for confirm) can't hold a typed acknowledgement. Deactivation is
// reversible, so a single acknowledgement is enough; permanent deletion keeps the
// type-DELETE gate.
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
      setDeactivateError('Something went wrong. Please try again.')
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
      setDeleteError('Something went wrong. Please try again.')
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
      {/* Deactivate — reversible */}
      <div className="rounded-[6px] border border-line bg-surface p-5">
        <div className="mb-2 font-mono text-[13px] font-semibold text-text">
          deactivate account
        </div>
        <p className="mb-3.5 mt-0 font-sans text-[13px] leading-normal text-text-muted">
          hides your profile from Explore and public surfaces until you
          reactivate.
        </p>
        <Button
          variant="monoOutline"
          size="meta"
          className="font-mono"
          onClick={() => {
            setDeactivateError(null)
            setDeactivateOpen(true)
          }}
        >
          deactivate account
        </Button>
      </div>

      {/* Delete — irreversible */}
      <div className="rounded-[6px] border border-danger/40 bg-danger/4 p-5">
        <div className="mb-2 font-mono text-[13px] font-semibold text-danger">
          delete account
        </div>
        <p className="mb-3.5 mt-0 font-sans text-[13px] leading-normal text-text-muted">
          permanently removes all your Locatic data. this cannot be undone.
        </p>
        <Button
          variant="destructive"
          size="meta"
          className="font-mono"
          onClick={() => resetDelete(true)}
        >
          delete account permanently
        </Button>
      </div>

      {/* Deactivate confirmation */}
      <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <DialogContent className="border-line bg-surface">
          <DialogHeader>
            <DialogTitle className="font-mono text-[15px] text-text">
              deactivate your account?
            </DialogTitle>
            <DialogDescription className="font-sans text-[13px] leading-normal text-text-muted">
              Your profile disappears from Explore and public surfaces right
              away. You can reactivate any time by signing back in — nothing is
              deleted.
            </DialogDescription>
          </DialogHeader>
          {deactivateError && (
            <p role="alert" className="m-0 font-mono text-[12px] text-danger">
              {deactivateError}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="monoOutline"
              size="meta"
              className="font-mono"
              disabled={deactivating}
              onClick={() => setDeactivateOpen(false)}
            >
              cancel
            </Button>
            <Button
              variant="monoOutline"
              size="meta"
              className="font-mono"
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
        <DialogContent className="border-danger/40 bg-surface">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono text-[15px] text-danger">
              <AlertTriangle size={16} aria-hidden />
              delete account permanently
            </DialogTitle>
            <DialogDescription className="font-sans text-[13px] leading-normal text-text-muted">
              This erases all of your Locatic data and cannot be undone. Type{' '}
              <span className="font-mono font-semibold text-text">
                DELETE
              </span>{' '}
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
            <p role="alert" className="m-0 font-mono text-[12px] text-danger">
              {deleteError}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="monoOutline"
              size="meta"
              className="font-mono"
              disabled={deleting}
              onClick={() => resetDelete(false)}
            >
              cancel
            </Button>
            <Button
              variant="destructive"
              size="meta"
              className="font-mono"
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
