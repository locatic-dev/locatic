import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Confirms deleting a comment or post (confirm, no undo). The
 * copy says what happens to what hangs off the item.
 */
export function ConfirmDeleteDialog({
  description,
  onConfirm,
  onOpenChange,
  open,
  title,
}: {
  description: string
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
  title: string
}) {
  // The dialog opens from state, not a Radix trigger, so Radix has nothing to
  // return focus to on close. Remember the control that had focus when it
  // opened (the delete button) and return focus there.
  const openerRef = useRef<HTMLElement | null>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={() => {
          const active = document.activeElement
          openerRef.current =
            active instanceof HTMLElement && active !== document.body
              ? active
              : null
        }}
        onCloseAutoFocus={(event) => {
          const opener = openerRef.current
          openerRef.current = null
          if (opener?.isConnected) {
            event.preventDefault()
            opener.focus()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button size="touch">cancel</Button>
          </DialogClose>
          <Button
            size="touch"
            variant="danger"
            onClick={() => {
              onOpenChange(false)
              onConfirm()
            }}
          >
            delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
