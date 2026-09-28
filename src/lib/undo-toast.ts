import { toast } from 'sonner'
import { reportActionError } from '@/lib/action-error'

const UNDO_TOAST_DURATION_MS = 5000

export interface ShowUndoToastOptions {
  /** Lowercase confirmation of what just happened, e.g. "unfollowed @ada". */
  message: string
  /**
   * Reverses the action through the caller's usual path (optimistic update
   * included). It must reject when the reverse fails so the failure is shown.
   */
  undo: () => Promise<unknown>
}

/**
 * Confirms a reversible action (unfollow, unpin) with an "undo" button. A
 * failed undo is reported with its specific reason, such as the pin cap.
 */
export function showUndoToast({ message, undo }: ShowUndoToastOptions): void {
  const runUndo = async () => {
    try {
      await undo()
    } catch (error) {
      reportActionError(error, { title: "couldn't undo", retry: runUndo })
    }
  }

  toast(message, {
    duration: UNDO_TOAST_DURATION_MS,
    action: {
      label: 'undo',
      onClick: () => {
        void runUndo()
      },
    },
  })
}
