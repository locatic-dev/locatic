// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  EXAMPLE_PINGS,
  PING_CARD_MS,
  PING_INTERVAL_MS,
  type PingItem,
} from '../landing-content'

import { PingMap } from '../ping-map'

/**
 * A controllable `prefers-reduced-motion` media query: tests flip it and it
 * dispatches `change` like the browser does when the OS setting changes.
 */
class FakeReducedMotionQuery extends EventTarget {
  matches = false
  readonly media = '(prefers-reduced-motion: reduce)'
  set(matches: boolean) {
    this.matches = matches
    this.dispatchEvent(new Event('change'))
  }
}

let reducedMotionQuery = new FakeReducedMotionQuery()

/** A controllable IntersectionObserver: tests decide what is on screen. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this)
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
  report(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
}

let visibility: DocumentVisibilityState = 'visible'

function setVisibility(next: DocumentVisibilityState) {
  visibility = next
  document.dispatchEvent(new Event('visibilitychange'))
}

function item(key: string, overrides: Partial<PingItem> = {}): PingItem {
  return {
    key,
    x: 0.3,
    y: 0.3,
    headline: `${key} pushed ${key}-repo`,
    place: `${key}-city`,
    at: null,
    avatarUrl: null,
    example: false,
    ...overrides,
  }
}

const ITEMS = [item('a'), item('b'), item('c'), item('d')]

function activeKeys(container: HTMLElement) {
  return [...container.querySelectorAll('[data-ping-key][data-active="true"]')]
    .map((node) => node.getAttribute('data-ping-key'))
    .filter(Boolean)
}

function cardKey(container: HTMLElement) {
  return (
    container
      .querySelector('[data-ping-card]')
      ?.getAttribute('data-ping-card') ?? null
  )
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  reducedMotionQuery = new FakeReducedMotionQuery()
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) =>
      query === reducedMotionQuery.media
        ? reducedMotionQuery
        : new FakeReducedMotionQuery(),
    ),
  )
  visibility = 'visible'
  FakeIntersectionObserver.instances = []
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
    () => visibility,
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('PingMap', () => {
  it('starts on item 0 with its card, then pings each item in order', () => {
    const { container } = render(<PingMap items={ITEMS} />)

    expect(activeKeys(container)).toEqual(['a'])
    expect(cardKey(container)).toBe('a')

    advance(PING_CARD_MS)
    expect(cardKey(container)).toBeNull()
    expect(activeKeys(container)).toEqual(['a'])

    advance(PING_INTERVAL_MS - PING_CARD_MS)
    expect(activeKeys(container)).toEqual(['b'])
    expect(cardKey(container)).toBe('b')

    advance(PING_INTERVAL_MS)
    expect(activeKeys(container)).toEqual(['c'])
    advance(PING_INTERVAL_MS)
    expect(activeKeys(container)).toEqual(['d'])
  })

  it('wraps around to item 0 after the last item', () => {
    const { container } = render(<PingMap items={ITEMS} />)

    for (const expected of ['b', 'c', 'd', 'a']) {
      advance(PING_INTERVAL_MS)
      expect(activeKeys(container)).toEqual([expected])
    }
    expect(cardKey(container)).toBe('a')
  })

  it('pauses while the tab is hidden and resumes when it is visible again', () => {
    const { container } = render(<PingMap items={ITEMS} />)

    act(() => setVisibility('hidden'))
    advance(PING_INTERVAL_MS * 3)
    expect(activeKeys(container)).toEqual(['a'])
    expect(cardKey(container)).toBe('a')

    act(() => setVisibility('visible'))
    advance(PING_INTERVAL_MS)
    expect(activeKeys(container)).toEqual(['b'])
  })

  it('pauses while the map is off screen', () => {
    const { container } = render(<PingMap items={ITEMS} />)
    const [observer] = FakeIntersectionObserver.instances

    act(() => observer?.report(false))
    advance(PING_INTERVAL_MS * 3)
    expect(activeKeys(container)).toEqual(['a'])

    act(() => observer?.report(true))
    advance(PING_INTERVAL_MS)
    expect(activeKeys(container)).toEqual(['b'])
  })

  it('shows a static frame of three pinged cities under reduced motion', () => {
    reducedMotionQuery.matches = true
    const { container } = render(<PingMap items={ITEMS} />)

    expect(activeKeys(container)).toEqual(['a', 'b', 'c'])
    expect(cardKey(container)).toBe('a')
    expect(vi.getTimerCount()).toBe(0)

    advance(PING_INTERVAL_MS * 4)
    expect(activeKeys(container)).toEqual(['a', 'b', 'c'])
    expect(cardKey(container)).toBe('a')
  })

  it('spreads the reduced-motion frame over distinct dots when it can', () => {
    reducedMotionQuery.matches = true
    const { container } = render(
      <PingMap
        items={[
          item('a'),
          item('b'),
          item('c', { x: 0.6, y: 0.6 }),
          item('d', { x: 0.7, y: 0.2 }),
        ]}
      />,
    )

    expect(activeKeys(container)).toEqual(['a', 'c', 'd'])
    expect(cardKey(container)).toBe('a')
  })

  it('still pings three items when they share fewer dots', () => {
    reducedMotionQuery.matches = true
    const { container } = render(
      <PingMap items={[item('a'), item('b'), item('c', { x: 0.6 })]} />,
    )

    expect(activeKeys(container)).toEqual(['a', 'b', 'c'])
  })

  it('labels example cards EXAMPLE, and real cards not', () => {
    const example = render(<PingMap items={EXAMPLE_PINGS} />)
    expect(
      example.container.querySelector('[data-ping-card]')?.textContent,
    ).toContain('EXAMPLE')
    example.unmount()

    const real = render(
      <PingMap
        items={[
          item('saroj', {
            headline: 'Saroj pushed portfolio',
            place: 'Hyderabad',
            at: Date.now() - 2 * 60 * 1000,
          }),
        ]}
      />,
    )
    const card = real.container.querySelector('[data-ping-card]')
    expect(card?.textContent).toContain('Saroj pushed portfolio')
    expect(card?.textContent).toContain('Hyderabad · 2m ago')
    expect(card?.textContent).not.toContain('EXAMPLE')
  })

  it('server-renders frame 0 whatever the motion preference, with no clock-based age', () => {
    reducedMotionQuery.matches = true
    const host = document.createElement('div')
    host.innerHTML = renderToString(
      <PingMap items={[item('a', { at: Date.now() }), item('b'), item('c')]} />,
    )

    expect(activeKeys(host)).toEqual(['a'])
    expect(cardKey(host)).toBe('a')
    expect(host.querySelector('[data-ping-card]')?.textContent).not.toMatch(
      /ago|just now/,
    )
  })

  it('keeps the map decorative and exposes only the pause control', () => {
    const { container } = render(<PingMap items={ITEMS} />)

    const map = container.querySelector('[data-ping-map]')
    expect(map?.getAttribute('aria-hidden')).toBe('true')
    expect(map?.querySelector('[data-ping-card]')).not.toBeNull()
    const pause = screen.getByRole('button', { name: 'pause map animation' })
    expect(pause.closest('[aria-hidden="true"]')).toBeNull()
  })

  it('pauses the cycle on the current frame and resumes from a full interval', () => {
    const { container } = render(<PingMap items={ITEMS} />)
    advance(PING_INTERVAL_MS)
    expect(activeKeys(container)).toEqual(['b'])

    fireEvent.click(screen.getByRole('button', { name: 'pause map animation' }))
    advance(PING_INTERVAL_MS * 3)
    expect(activeKeys(container)).toEqual(['b'])
    expect(cardKey(container)).toBe('b')
    expect(vi.getTimerCount()).toBe(0)

    const play = screen.getByRole('button', { name: 'play map animation' })
    expect(play.textContent).toBe('play')
    fireEvent.click(play)
    advance(PING_INTERVAL_MS)
    expect(activeKeys(container)).toEqual(['c'])
  })

  it('stops at once when reduced motion is switched on mid-cycle', () => {
    const { container } = render(<PingMap items={ITEMS} />)
    advance(PING_INTERVAL_MS)
    expect(activeKeys(container)).toEqual(['b'])

    act(() => reducedMotionQuery.set(true))

    expect(activeKeys(container)).toEqual(['a', 'b', 'c'])
    expect(cardKey(container)).toBe('a')
    expect(vi.getTimerCount()).toBe(0)
    // Nothing moves, so there is nothing to pause.
    expect(screen.queryByRole('button', { name: /map animation/ })).toBeNull()

    act(() => reducedMotionQuery.set(false))
    advance(PING_INTERVAL_MS)
    expect(activeKeys(container)).toEqual(['c'])
  })

  it('renders only the map, with no timers, when there is nothing to ping', () => {
    const { container } = render(<PingMap items={[]} />)

    expect(container.querySelectorAll('[data-ping-key]')).toHaveLength(0)
    expect(cardKey(container)).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears its timers and listeners on unmount', () => {
    const removeListener = vi.spyOn(document, 'removeEventListener')
    const { unmount } = render(<PingMap items={ITEMS} />)
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    unmount()

    expect(vi.getTimerCount()).toBe(0)
    expect(removeListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    )
  })
})
