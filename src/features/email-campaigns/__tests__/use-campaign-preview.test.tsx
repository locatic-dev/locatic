// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EmailPreviewArgs } from '../contracts'

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
}))

vi.mock('../mutations', () => ({
  usePreviewEmailCampaign: () => mocks.preview,
}))

import {
  PREVIEW_DEBOUNCE_MS,
  useCampaignPreview,
} from '../use-campaign-preview'

function args(body: string): EmailPreviewArgs {
  return {
    subject: 'News',
    preheader: '',
    content: { kind: 'announcement', body, cta: null },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('useCampaignPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.preview.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('waits for typing to pause before asking for one preview', async () => {
    mocks.preview.mockImplementation(async ({ requestId }) => ({
      requestId,
      html: '<p>rendered</p>',
    }))
    const { result, rerender } = renderHook(
      ({ value }) => useCampaignPreview(value),
      { initialProps: { value: args('a') } },
    )

    rerender({ value: args('ab') })
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    rerender({ value: args('abc') })
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    expect(mocks.preview).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS)
    })
    expect(mocks.preview).toHaveBeenCalledTimes(1)
    expect(mocks.preview.mock.calls[0]?.[0]).toMatchObject({
      content: { body: 'abc' },
    })
    expect(result.current.html).toBe('<p>rendered</p>')
  })

  it('keeps the newest preview when an older response arrives late', async () => {
    const first = deferred<{ requestId: number; html: string }>()
    const second = deferred<{ requestId: number; html: string }>()
    mocks.preview
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const { result, rerender } = renderHook(
      ({ value }) => useCampaignPreview(value),
      { initialProps: { value: args('old') } },
    )
    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS)
    })
    rerender({ value: args('new') })
    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS)
    })
    const [oldRequest, newRequest] = mocks.preview.mock.calls.map(
      ([value]) => value.requestId as number,
    )

    await act(async () => {
      second.resolve({ requestId: newRequest!, html: '<p>new</p>' })
    })
    await act(async () => {
      first.resolve({ requestId: oldRequest!, html: '<p>old</p>' })
    })

    expect(result.current.html).toBe('<p>new</p>')
    expect(result.current.isLoading).toBe(false)
  })

  it('ignores an old response that arrives while the next edit is still debouncing', async () => {
    const first = deferred<{ requestId: number; html: string }>()
    const second = deferred<{ requestId: number; html: string }>()
    mocks.preview
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const { result, rerender } = renderHook(
      ({ value }) => useCampaignPreview(value),
      { initialProps: { value: args('old') } },
    )
    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS)
    })
    const oldRequest = mocks.preview.mock.calls[0]?.[0].requestId as number

    rerender({ value: args('new') })
    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS / 2)
    })
    await act(async () => {
      first.resolve({ requestId: oldRequest, html: '<p>old</p>' })
    })

    expect(result.current.html).toBeNull()
    expect(result.current.isLoading).toBe(true)

    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS)
    })
    const newRequest = mocks.preview.mock.calls[1]?.[0].requestId as number
    await act(async () => {
      second.resolve({ requestId: newRequest, html: '<p>new</p>' })
    })
    expect(result.current.html).toBe('<p>new</p>')
    expect(result.current.isLoading).toBe(false)
  })

  it('reports a failed preview without dropping the last good one', async () => {
    const { ConvexError } = await import('convex/values')
    mocks.preview
      .mockImplementationOnce(async ({ requestId }) => ({
        requestId,
        html: '<p>ok</p>',
      }))
      .mockImplementationOnce(async () => {
        throw new ConvexError('Subject is too long')
      })
    const { result, rerender } = renderHook(
      ({ value }) => useCampaignPreview(value),
      { initialProps: { value: args('ok') } },
    )
    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS)
    })
    rerender({ value: args('too long') })
    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS)
    })

    expect(result.current.html).toBe('<p>ok</p>')
    expect(result.current.error).toBe('subject is too long')
  })
})
