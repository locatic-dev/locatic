// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HYDRATED_NOW_TICK_MS, useHydratedNow } from '../use-hydrated-now'

const START = Date.UTC(2026, 8, 30, 12)

function Clock() {
  const now = useHydratedNow()
  return <output>{now === null ? 'pending' : String(now)}</output>
}

describe('useHydratedNow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(START)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('is null in the server render', () => {
    expect(renderToString(<Clock />)).toContain('pending')
  })

  it('hydrates the server markup without a mismatch, then reads the clock', async () => {
    const container = document.createElement('div')
    container.innerHTML = renderToString(<Clock />)
    document.body.append(container)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const recoverable = vi.fn()

    // A later client clock than the server's, as in a real page load.
    vi.setSystemTime(START + 5_000)
    const root = await act(async () =>
      hydrateRoot(container, <Clock />, {
        onRecoverableError: recoverable,
      }),
    )

    expect(recoverable).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
    expect(container.textContent).toBe(String(START + 5_000))

    act(() => root.unmount())
    container.remove()
  })

  it('returns the time on the first render of a client mount and advances each minute', () => {
    render(<Clock />)
    expect(screen.getByRole('status').textContent).toBe(String(START))

    act(() => {
      vi.advanceTimersByTime(HYDRATED_NOW_TICK_MS)
    })
    expect(screen.getByRole('status').textContent).toBe(
      String(START + HYDRATED_NOW_TICK_MS),
    )
  })

  it('shares one interval between readers and stops it when the last unmounts', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    const clockIntervals = () =>
      setIntervalSpy.mock.calls.filter(
        ([, delay]) => delay === HYDRATED_NOW_TICK_MS,
      ).length

    const first = render(<Clock />)
    const second = render(<Clock />)
    expect(clockIntervals()).toBe(1)

    act(() => {
      vi.advanceTimersByTime(HYDRATED_NOW_TICK_MS)
    })
    expect(
      screen.getAllByRole('status').map((output) => output.textContent),
    ).toEqual([
      String(START + HYDRATED_NOW_TICK_MS),
      String(START + HYDRATED_NOW_TICK_MS),
    ])

    first.unmount()
    expect(clearIntervalSpy).not.toHaveBeenCalled()
    second.unmount()
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1)

    // A later reader starts a fresh clock from the current time.
    vi.setSystemTime(START + 10 * HYDRATED_NOW_TICK_MS)
    render(<Clock />)
    expect(clockIntervals()).toBe(2)
    expect(screen.getByRole('status').textContent).toBe(
      String(START + 10 * HYDRATED_NOW_TICK_MS),
    )
  })
})
