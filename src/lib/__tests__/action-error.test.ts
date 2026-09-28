import { ConvexError } from 'convex/values'
import { afterEach, describe, expect, it, vi } from 'vitest'

const toastError = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({
  toast: { error: toastError },
}))

import {
  GENERIC_ACTION_ERROR_MESSAGE,
  getActionErrorMessage,
  reportActionError,
} from '../action-error'

type ToastOptions = {
  action?: { label: string; onClick: () => void }
  description?: string
}

function lastToast() {
  const [message, options] = toastError.mock.calls.at(-1) as [
    string,
    ToastOptions,
  ]
  return { message, options }
}

describe('getActionErrorMessage', () => {
  it('uses the message a Convex function threw on purpose', () => {
    expect(
      getActionErrorMessage(new ConvexError('You cannot follow yourself')),
    ).toBe('you cannot follow yourself')
    expect(
      getActionErrorMessage(new ConvexError({ message: 'Post not found' })),
    ).toBe('post not found')
  })

  it('keeps a leading proper noun intact', () => {
    expect(
      getActionErrorMessage(new ConvexError('GitHub access token not found')),
    ).toBe('GitHub access token not found')
  })

  it('maps rate limits and the pin cap to specific copy', () => {
    expect(
      getActionErrorMessage(
        new ConvexError('Too many requests. Try again in 12s.'),
      ),
    ).toBe('slow down. try again in 12s.')
    expect(
      getActionErrorMessage(new ConvexError({ kind: 'RateLimited' })),
    ).toBe('slow down. try again in a moment.')
    expect(
      getActionErrorMessage(
        new ConvexError('You can pin at most three projects'),
      ),
    ).toBe('you can pin up to three projects. unpin one first.')
  })

  it('never surfaces transport errors, stacks or request ids', () => {
    const serverError = new Error(
      '[CONVEX M(follows:follow)] [Request ID: 5f2a9c] Server Error\n    at handler (follows.ts:12)',
    )

    expect(getActionErrorMessage(serverError)).toBe(
      GENERIC_ACTION_ERROR_MESSAGE,
    )
    expect(getActionErrorMessage('boom')).toBe(GENERIC_ACTION_ERROR_MESSAGE)
    expect(getActionErrorMessage(new ConvexError({ code: 42 }))).toBe(
      GENERIC_ACTION_ERROR_MESSAGE,
    )
  })
})

describe('reportActionError', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('shows the derived reason when no title is given', () => {
    reportActionError(new ConvexError('Too many requests. Try again in 3s.'))

    expect(lastToast().message).toBe('slow down. try again in 3s.')
    expect(lastToast().options.action).toBeUndefined()
  })

  it('puts a specific reason under the title and omits a generic one', () => {
    reportActionError(new ConvexError('User not found'), {
      title: "couldn't follow",
    })
    expect(lastToast()).toMatchObject({
      message: "couldn't follow",
      options: { description: 'user not found' },
    })

    reportActionError(new Error('network down'), { title: "couldn't follow" })
    expect(lastToast().options.description).toBeUndefined()
  })

  it('offers a retry action that re-runs the callback', () => {
    const retry = vi.fn()

    reportActionError(new Error('offline'), { retry })
    const { action } = lastToast().options
    expect(action?.label).toBe('retry')

    action?.onClick()
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('logs the original error only in development', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('original')

    vi.stubEnv('MODE', 'production')
    reportActionError(error)
    expect(consoleError).not.toHaveBeenCalled()

    vi.stubEnv('MODE', 'development')
    reportActionError(error)
    expect(consoleError).toHaveBeenCalledWith(error)
  })
})
