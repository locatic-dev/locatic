import { ConvexError } from 'convex/values'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { toast, toastError } = vi.hoisted(() => {
  const toastError = vi.fn()
  const toast = Object.assign(vi.fn(), { error: toastError })
  return { toast, toastError }
})

vi.mock('sonner', () => ({ toast }))

import { showUndoToast } from '../undo-toast'

type ToastOptions = {
  action?: { label: string; onClick: () => void }
  description?: string
  duration?: number
}

function lastCall(mock: typeof toast | typeof toastError) {
  const [message, options] = mock.mock.calls.at(-1) as [string, ToastOptions]
  return { message, options }
}

async function clickUndo() {
  lastCall(toast).options.action?.onClick()
  // Let the undo promise and its catch handler settle.
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('showUndoToast', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows the message with an undo action that dismisses on its own', () => {
    showUndoToast({ message: 'unfollowed @ada', undo: vi.fn() })

    const { message, options } = lastCall(toast)
    expect(message).toBe('unfollowed @ada')
    expect(options.action?.label).toBe('undo')
    expect(options.duration).toBe(5000)
  })

  it('runs undo only when the action is chosen', async () => {
    const undo = vi.fn().mockResolvedValue(undefined)
    showUndoToast({ message: 'unpinned locatic', undo })

    expect(undo).not.toHaveBeenCalled()
    await clickUndo()

    expect(undo).toHaveBeenCalledTimes(1)
    expect(toastError).not.toHaveBeenCalled()
  })

  it('reports a failed undo with the specific reason and a retry', async () => {
    const undo = vi
      .fn()
      .mockRejectedValueOnce(
        new ConvexError('You can pin at most three projects'),
      )
      .mockResolvedValueOnce(undefined)
    showUndoToast({ message: 'unpinned locatic', undo })

    await clickUndo()

    const failure = lastCall(toastError)
    expect(failure.message).toBe("couldn't undo")
    expect(failure.options.description).toBe(
      'you can pin up to three projects. unpin one first.',
    )
    expect(failure.options.action?.label).toBe('retry')

    failure.options.action?.onClick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(undo).toHaveBeenCalledTimes(2)
    expect(toastError).toHaveBeenCalledTimes(1)
  })
})
