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

import { anchorVariables, faceRotation, projectToGlobe } from '../globe'
import { PingGlobe, pickStaticPings } from '../ping-globe'

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

// Places near Bengaluru, so every test item faces the viewer together.
const HERE = { lat: 12.97, lng: 77.59 }

function item(key: string, overrides: Partial<PingItem> = {}): PingItem {
  return {
    key,
    ...HERE,
    headline: `${key} pushed ${key}-repo`,
    place: `${key}-city`,
    at: null,
    avatarUrl: null,
    example: false,
    ...overrides,
  }
}

const HYDERABAD = { lat: 17.39, lng: 78.49 }
const KOLKATA = { lat: 22.57, lng: 88.36 }

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

/**
 * A controllable requestAnimationFrame: frames run only when a test flushes
 * them, so the loop's bookkeeping is visible.
 */
const frames = new Map<number, FrameRequestCallback>()
let nextFrameId = 1
let frameTime = 0

function flushFrames(count: number, stepMs = 16) {
  act(() => {
    for (let index = 0; index < count; index++) {
      const pending = [...frames.entries()]
      frames.clear()
      frameTime += stepMs
      for (const [, callback] of pending) {
        callback(frameTime)
      }
    }
  })
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

/** Runs timers and animation frames together on one clock, frame by frame. */
function play(ms: number, stepMs = 16) {
  for (let elapsed = 0; elapsed < ms; elapsed += stepMs) {
    const step = Math.min(stepMs, ms - elapsed)
    advance(step)
    flushFrames(1, step)
  }
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
  frames.clear()
  frameTime = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrameId++
    frames.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  // jsdom has no canvas: the globe must cope with a missing 2D context.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('PingGlobe', () => {
  it('starts on item 0 with its card, then pings each item in order', () => {
    const { container } = render(<PingGlobe items={ITEMS} />)

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
    const { container } = render(<PingGlobe items={ITEMS} />)

    for (const expected of ['b', 'c', 'd', 'a']) {
      advance(PING_INTERVAL_MS)
      expect(activeKeys(container)).toEqual([expected])
    }
    expect(cardKey(container)).toBe('a')
  })

  it('pauses while the tab is hidden and resumes when it is visible again', () => {
    const { container } = render(<PingGlobe items={ITEMS} />)

    act(() => setVisibility('hidden'))
    advance(PING_INTERVAL_MS * 3)
    expect(activeKeys(container)).toEqual(['a'])
    expect(cardKey(container)).toBe('a')

    act(() => setVisibility('visible'))
    advance(PING_INTERVAL_MS)
    expect(activeKeys(container)).toEqual(['b'])
  })

  it('pauses while the globe is off screen', () => {
    const { container } = render(<PingGlobe items={ITEMS} />)
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
    const { container } = render(<PingGlobe items={ITEMS} />)

    expect(activeKeys(container)).toEqual(['a', 'b', 'c'])
    expect(cardKey(container)).toBe('a')
    expect(vi.getTimerCount()).toBe(0)

    advance(PING_INTERVAL_MS * 4)
    expect(activeKeys(container)).toEqual(['a', 'b', 'c'])
    expect(cardKey(container)).toBe('a')
  })

  it('spreads the reduced-motion frame over distinct places when it can', () => {
    reducedMotionQuery.matches = true
    const { container } = render(
      <PingGlobe
        items={[item('a'), item('b'), item('c', HYDERABAD), item('d', KOLKATA)]}
      />,
    )

    expect(activeKeys(container)).toEqual(['a', 'c', 'd'])
    expect(cardKey(container)).toBe('a')
  })

  it('still pings three items when they share fewer places', () => {
    reducedMotionQuery.matches = true
    const { container } = render(
      <PingGlobe items={[item('a'), item('b'), item('c', HYDERABAD)]} />,
    )

    expect(activeKeys(container)).toEqual(['a', 'b', 'c'])
  })

  it('labels example cards EXAMPLE, and real cards not', () => {
    const example = render(<PingGlobe items={EXAMPLE_PINGS} />)
    expect(
      example.container.querySelector('[data-ping-card]')?.textContent,
    ).toContain('EXAMPLE')
    example.unmount()

    const real = render(
      <PingGlobe
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
      <PingGlobe
        items={[item('a', { at: Date.now() }), item('b'), item('c')]}
      />,
    )

    expect(activeKeys(host)).toEqual(['a'])
    expect(cardKey(host)).toBe('a')
    expect(host.querySelector('[data-ping-card]')?.textContent).not.toMatch(
      /ago|just now/,
    )
  })

  it('keeps the globe decorative and exposes only the pause control', () => {
    const { container } = render(<PingGlobe items={ITEMS} />)

    const map = container.querySelector('[data-ping-globe]')
    expect(map?.getAttribute('aria-hidden')).toBe('true')
    expect(map?.querySelector('[data-ping-card]')).not.toBeNull()
    const pause = screen.getByRole('button', { name: 'pause map animation' })
    expect(pause.closest('[aria-hidden="true"]')).toBeNull()
  })

  it('pauses the cycle on the current frame and resumes from a full interval', () => {
    const { container } = render(<PingGlobe items={ITEMS} />)
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
    const { container } = render(<PingGlobe items={ITEMS} />)
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

  it('renders only the globe, with no timers or frames, when there is nothing to ping', () => {
    const { container } = render(<PingGlobe items={[]} />)

    expect(container.querySelectorAll('[data-ping-key]')).toHaveLength(0)
    expect(cardKey(container)).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    expect(frames.size).toBe(0)
  })

  it('clears its timers, frames and listeners on unmount', () => {
    const removeListener = vi.spyOn(document, 'removeEventListener')
    const { unmount } = render(<PingGlobe items={ITEMS} />)
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    expect(frames.size).toBe(1)

    unmount()

    expect(vi.getTimerCount()).toBe(0)
    expect(frames.size).toBe(0)
    expect(removeListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    )
  })
})

/** The anchor layer that places `element` on its city. */
function anchorOf(element: Element | null | undefined) {
  return element?.closest<HTMLElement>('[data-globe-anchor]') ?? null
}

function cardAnchor(container: ParentNode) {
  return anchorOf(container.querySelector('[data-ping-card]'))
}

function readVariable(element: HTMLElement | null, name: string) {
  return element?.style.getPropertyValue(name) ?? ''
}

describe('PingGlobe globe', () => {
  it('server-renders the card at item 0 as projected with the globe facing it', () => {
    const items = [...EXAMPLE_PINGS]
    const markup = renderToString(<PingGlobe items={items} />)
    // Deterministic: the same props give the same markup.
    expect(renderToString(<PingGlobe items={items} />)).toBe(markup)

    const host = document.createElement('div')
    host.innerHTML = markup
    const expected = anchorVariables(items[0], faceRotation(items[0]))
    const anchor = cardAnchor(host)
    expect(readVariable(anchor, '--gx')).toBe(expected['--gx'])
    expect(readVariable(anchor, '--gy')).toBe(expected['--gy'])
    expect(readVariable(anchor, '--gv')).toBe('1.00')
    // The canvas is empty on the server; the box keeps its square.
    expect(host.querySelector('canvas')).not.toBeNull()
    expect(host.querySelector('.aspect-square')).not.toBeNull()
  })

  it('runs one animation frame loop that drifts the card with its city', () => {
    const { container } = render(<PingGlobe items={ITEMS} />)
    const before = readVariable(cardAnchor(container), '--gx')

    flushFrames(60)

    expect(frames.size).toBe(1)
    const after = readVariable(cardAnchor(container), '--gx')
    // The globe turns eastward, so the city and its card move right.
    expect(Number.parseFloat(after)).toBeGreaterThan(Number.parseFloat(before))
  })

  it('turns to the next city once the card closes, so it arrives facing the viewer', () => {
    const items = [...EXAMPLE_PINGS]
    const { container } = render(<PingGlobe items={items} />)
    // Berlin starts well round the globe from Bengaluru.
    const berlin = items[1]
    expect(projectToGlobe(berlin, faceRotation(items[0])).z).toBeLessThan(0.5)

    // Exactly one interval of real time: the turn must land by the ping.
    play(PING_INTERVAL_MS)

    expect(cardKey(container)).toBe(berlin.key)
    const anchor = cardAnchor(container)
    expect(readVariable(anchor, '--gv')).toBe('1.00')
    const left = Number.parseFloat(readVariable(anchor, '--gx'))
    expect(left).toBeGreaterThan(35)
    expect(left).toBeLessThan(55)
  })

  it('stops the frame loop while paused, hidden or off screen', () => {
    render(<PingGlobe items={ITEMS} />)
    expect(frames.size).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'pause map animation' }))
    expect(frames.size).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'play map animation' }))
    expect(frames.size).toBe(1)

    act(() => setVisibility('hidden'))
    expect(frames.size).toBe(0)
    act(() => setVisibility('visible'))
    expect(frames.size).toBe(1)

    act(() => FakeIntersectionObserver.instances[0]?.report(false))
    expect(frames.size).toBe(0)
  })

  it('draws a still frame facing item 0 under reduced motion, with no frames', () => {
    reducedMotionQuery.matches = true
    const items = [item('a'), item('b', HYDERABAD), item('c', KOLKATA)]
    const { container } = render(<PingGlobe items={items} />)

    expect(frames.size).toBe(0)
    const face = faceRotation(items[0])
    for (const [index, key] of ['a', 'b', 'c'].entries()) {
      const marker = container.querySelector<HTMLElement>(
        `[data-ping-key="${key}"]`,
      )
      expect(readVariable(marker, '--gx')).toBe(
        anchorVariables(items[index], face)['--gx'],
      )
      expect(readVariable(marker, '--gv')).toBe('1.00')
    }
    expect(cardKey(container)).toBe('a')
  })

  it('redraws at the new pixel ratio when the window moves screens', () => {
    // A 2D context that accepts every call, so the renderer is created.
    const context = new Proxy(
      {},
      { get: () => () => ({ addColorStop() {} }), set: () => true },
    ) as CanvasRenderingContext2D
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(420)
    const resolutionQueries: FakeReducedMotionQuery[] = []
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => {
        if (query === reducedMotionQuery.media) {
          return reducedMotionQuery
        }
        const next = new FakeReducedMotionQuery()
        if (query.startsWith('(resolution:')) {
          resolutionQueries.push(next)
        }
        return next
      }),
    )
    vi.stubGlobal('devicePixelRatio', 1)

    const { container } = render(<PingGlobe items={ITEMS} />)
    const canvas = container.querySelector('canvas')
    expect(canvas?.width).toBe(420)

    // Same CSS box, new screen: no resize fires, only the resolution query.
    vi.stubGlobal('devicePixelRatio', 2)
    act(() => resolutionQueries.at(-1)?.set(false))

    expect(canvas?.width).toBe(840)
    // Re-armed for the new ratio, so a move back is caught too.
    expect(resolutionQueries).toHaveLength(2)
  })

  it('anchors the pause control to the globe box, outside the hidden layer', () => {
    const { container } = render(<PingGlobe items={ITEMS} />)
    const pause = screen.getByRole('button', { name: 'pause map animation' })
    const globe = container.querySelector('[data-ping-globe]')
    expect(pause.parentElement).toBe(globe?.parentElement)
    expect(pause.className).toContain('right-0')
    expect(pause.className).toContain('bottom-0')
  })
})

describe('pickStaticPings', () => {
  const SAN_FRANCISCO = { lat: 37.77, lng: -122.42 }
  const TOKYO = { lat: 35.68, lng: 139.69 }

  it('prefers places in distinct cells on the face the still frame shows', () => {
    expect([
      ...pickStaticPings([HERE, SAN_FRANCISCO, HERE, HYDERABAD, TOKYO], 3),
    ]).toEqual([0, 3, 4])
  })

  it('falls back to hidden places, then to shared cells, to fill the frame', () => {
    expect([...pickStaticPings([HERE, SAN_FRANCISCO, HERE], 3)]).toEqual([
      0, 1, 2,
    ])
    expect([...pickStaticPings([HERE], 3)]).toEqual([0])
    expect([...pickStaticPings([], 3)]).toEqual([])
  })
})
