import * as m from 'motion/react-m'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { Link } from '@tanstack/react-router'
import { LxAvatar } from '@/components/ui/lx-avatar'
import type { LatLng } from '@/lib/geo'
import { easeOutExpo, usePrefersReducedMotion } from '@/lib/motion'
import { relativeTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import {
  anchorVariables,
  clampDragPhi,
  dragDegreesPerPixel,
  dragRotation,
  faceRotation,
  projectToGlobe,
  stepSpring,
  toBoxFraction,
  wrapLongitude,
  type GlobeRotation,
  type SpringAxis,
} from '@/features/landing/globe'
import {
  createGlobeRenderer,
  type GlobeRenderer,
} from '@/features/landing/globe-renderer'
import {
  PING_CARD_MS,
  PING_INTERVAL_MS,
  getLatLngCell,
  type PingItem,
} from '@/features/landing/landing-content'

/** Cities the reduced-motion frame shows pinged at once. */
const STATIC_PING_COUNT = 3
/**
 * Depth a reduced-motion ping must reach on item 0's face to be preferred:
 * well inside the rim, where it reads as a place, not an edge.
 */
const STATIC_MIN_DEPTH = 0.25
/** Degrees per second the globe drifts eastward between turns. */
const DRIFT_DEGREES_PER_SECOND = 4
/** Spring frequency of a turn to the next city; it settles in about a second. */
const TURN_OMEGA = 5
/** Longest step the loop integrates, so a stalled frame never jumps. */
const MAX_FRAME_SECONDS = 1 / 30
/**
 * Cards open downward unless their city rests below this fraction of the
 * box. Faced cities rest just below centre, so their cards cover the ocean
 * south of them rather than the land around them.
 */
const CARD_OPENS_DOWN_ABOVE = 0.62
/**
 * Share of the box a floating card leaves between itself and the box edge it
 * opens towards: its city drifts on while the card is up, and the card must
 * not follow it out of the box (the page clips horizontal overflow).
 */
const CARD_DRIFT_ROOM = 0.12
/** Where the globe faces when there is nothing to ping. */
const DEFAULT_ROTATION: GlobeRotation = { lambda: 20, phi: 20 }
/** Pixels a pointer moves before a press becomes a drag, not a click. */
const DRAG_THRESHOLD_PX = 4
/** How long the tour waits after a drag before it turns the globe again. */
const DRAG_COAST_MS = 2000
/** Rate the globe's spin decays at after a flick, per second. */
const INERTIA_DECAY = 3
/** A release this long after the last move is a stop, not a flick. */
const FLICK_WINDOW_MS = 80
/** Fastest flick spin, in degrees per second. */
const MAX_SPIN = 720

// Client-only facts read through useSyncExternalStore: the server snapshot is
// what the server rendered, so hydration always matches, and React re-renders
// with the browser's value right after.
const subscribeNever = () => () => {}
const readHydrated = () => true
const readServerHydrated = () => false

function subscribeVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}
const readPageVisible = () => document.visibilityState !== 'hidden'
const readServerPageVisible = () => true

/**
 * The reduced-motion frame: item 0, then items in other ~1° cells that face
 * the viewer when the globe faces item 0 (several pings in one cell, or on
 * the far side, would read as one), then the rest in order.
 */
export function pickStaticPings(
  items: ReadonlyArray<LatLng>,
  count: number,
): Set<number> {
  const chosen: number[] = []
  const cells = new Set<string>()
  const face = items[0] ? faceRotation(items[0]) : null
  const take = (accept: (item: LatLng) => boolean) => {
    items.forEach((item, index) => {
      if (chosen.length >= count || chosen.includes(index)) {
        return
      }
      const cell = getLatLngCell(item)
      if (!cells.has(cell) && accept(item)) {
        cells.add(cell)
        chosen.push(index)
      }
    })
  }
  take((item) =>
    face ? projectToGlobe(item, face).z >= STATIC_MIN_DEPTH : true,
  )
  take(() => true)
  for (let index = 0; index < items.length && chosen.length < count; index++) {
    if (!chosen.includes(index)) {
      chosen.push(index)
    }
  }
  return new Set(chosen)
}

/** Whether the globe is on screen; true until an observer says otherwise. */
function useInView(ref: RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(true)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined') {
      return
    }
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (entry) {
        setInView(entry.isIntersecting)
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return inView
}

type Anchor = { element: HTMLElement; lat: number; lng: number }

/** The globe's imperative state, shared by the effects and the rAF loop. */
type Scene = {
  renderer: GlobeRenderer | null
  rotation: GlobeRotation
  lambda: SpringAxis
  phi: SpringAxis
  /** The rotation the globe turns towards, before drift. */
  target: GlobeRotation
  /** The turn `target` belongs to; a new turn restarts the drift. */
  turn: number
  /** Degrees drifted since the turn began. */
  drift: number
  cities: ReadonlyArray<LatLng>
  anchors: Anchor[]
  /**
   * Whether the viewer has the globe: while dragging and during the hold
   * after, it coasts on the drag's spin instead of touring.
   */
  held: boolean
  /** Whether the viewer has ever turned it; still frames then keep their turn. */
  turnedByViewer: boolean
}

function createScene(rotation: GlobeRotation): Scene {
  return {
    renderer: null,
    rotation: { ...rotation },
    lambda: { value: rotation.lambda, velocity: 0 },
    phi: { value: rotation.phi, velocity: 0 },
    target: rotation,
    turn: 0,
    drift: 0,
    cities: [],
    anchors: [],
    held: false,
    turnedByViewer: false,
  }
}

/** Sets the rotation directly, as a drag does. */
function placeScene(scene: Scene, rotation: GlobeRotation) {
  scene.lambda.value = rotation.lambda
  scene.phi.value = rotation.phi
  scene.rotation.lambda = rotation.lambda
  scene.rotation.phi = rotation.phi
}

/** One frame after a flick: the spin carries on and decays. */
function coastScene(scene: Scene, dt: number) {
  const decay = Math.exp(-INERTIA_DECAY * dt)
  scene.lambda.velocity *= decay
  scene.phi.velocity *= decay
  const nextPhi = scene.phi.value + scene.phi.velocity * dt
  const phi = clampDragPhi(nextPhi)
  if (phi !== nextPhi) {
    // The tilt stops at its limit rather than pressing against it.
    scene.phi.velocity = 0
  }
  placeScene(scene, {
    lambda: wrapLongitude(scene.lambda.value + scene.lambda.velocity * dt),
    phi,
  })
}

function snapScene(scene: Scene, rotation: GlobeRotation) {
  scene.lambda.value = rotation.lambda
  scene.lambda.velocity = 0
  scene.phi.value = rotation.phi
  scene.phi.velocity = 0
  scene.rotation.lambda = rotation.lambda
  scene.rotation.phi = rotation.phi
  scene.drift = 0
}

/** One frame of motion: drift, and ease towards the current target. */
function advanceScene(scene: Scene, dt: number) {
  if (scene.held) {
    coastScene(scene, dt)
    return
  }
  scene.drift += DRIFT_DEGREES_PER_SECOND * dt
  const lambdaGoal = scene.target.lambda - scene.drift
  stepSpring(
    scene.lambda,
    wrapLongitude(lambdaGoal - scene.lambda.value),
    dt,
    TURN_OMEGA,
  )
  scene.lambda.value = wrapLongitude(scene.lambda.value)
  stepSpring(scene.phi, scene.target.phi - scene.phi.value, dt, TURN_OMEGA)
  scene.rotation.lambda = scene.lambda.value
  scene.rotation.phi = scene.phi.value
}

/**
 * Far-side anchors are hidden, not just transparent: a transparent card
 * still takes clicks and hovers.
 */
function anchorVisibility(opacity: string): 'visible' | 'hidden' {
  return Number(opacity) > 0 ? 'visible' : 'hidden'
}

function writeAnchor(anchor: Anchor, rotation: GlobeRotation) {
  const variables = anchorVariables(anchor, rotation)
  anchor.element.style.setProperty('--gx', variables['--gx'])
  anchor.element.style.setProperty('--gy', variables['--gy'])
  anchor.element.style.setProperty('--gv', variables['--gv'])
  anchor.element.style.visibility = anchorVisibility(variables['--gv'])
}

function renderScene(scene: Scene) {
  scene.renderer?.draw(scene.rotation, scene.cities)
  for (const anchor of scene.anchors) {
    writeAnchor(anchor, scene.rotation)
  }
}

/** Inline custom properties that place an anchor on first paint. */
function anchorStyle(point: LatLng, rotation: GlobeRotation): CSSProperties {
  const variables = anchorVariables(point, rotation)
  return {
    ...variables,
    visibility: anchorVisibility(variables['--gv']),
  } as CSSProperties
}

type DragState = {
  pointerId: number
  /** Where the drag is measured from: the press, then where it became a drag. */
  originX: number
  originY: number
  origin: GlobeRotation
  dragging: boolean
  lastX: number
  lastY: number
  lastTime: number
  /** The latest pointer speed, in degrees per second. */
  lambdaSpeed: number
  phiSpeed: number
}

function clampSpin(speed: number): number {
  return Math.min(Math.max(speed, -MAX_SPIN), MAX_SPIN)
}

/**
 * Drag to turn the globe: the globe follows the pointer and a flick spins it
 * on (not under reduced motion; direct manipulation itself stays). Grabbing
 * the globe calls `onGrab`, which pauses the tour until the viewer presses
 * play. A press that moves less than `DRAG_THRESHOLD_PX` stays a click, so
 * the card under it still opens; the pointer click that ends a drag is
 * swallowed, keyboard clicks never are.
 * `held` is true from the drag's start until the flick has coasted out
 * (`DRAG_COAST_MS` after the release). Switching reduced motion on stops a
 * released flick at once.
 */
function useGlobeDrag(
  sceneRef: RefObject<Scene | null>,
  boxRef: RefObject<HTMLDivElement | null>,
  reducedMotion: boolean,
  onGrab: () => void,
) {
  const [held, setHeld] = useState(false)
  const dragRef = useRef<DragState | null>(null)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const swallowClickRef = useRef(false)
  // Stops listening for the release of a press that is not yet a drag.
  const unwatchReleaseRef = useRef<(() => void) | null>(null)
  const reducedMotionRef = useRef(reducedMotion)
  const onGrabRef = useRef(onGrab)
  useEffect(() => {
    reducedMotionRef.current = reducedMotion
    onGrabRef.current = onGrab
  }, [reducedMotion, onGrab])
  useEffect(
    () => () => {
      clearTimeout(holdTimerRef.current)
      unwatchReleaseRef.current?.()
    },
    [],
  )

  // Reduced motion switched on: a released flick stops where it is. A drag
  // still in progress keeps following the pointer.
  useEffect(() => {
    const scene = sceneRef.current
    if (!reducedMotion || !scene) {
      return
    }
    scene.lambda.velocity = 0
    scene.phi.velocity = 0
    if (scene.held && !dragRef.current?.dragging) {
      clearTimeout(holdTimerRef.current)
      scene.held = false
      setHeld(false)
    }
  }, [reducedMotion, sceneRef])

  const forgetPress = () => {
    dragRef.current = null
    unwatchReleaseRef.current?.()
    unwatchReleaseRef.current = null
  }

  /**
   * Nothing captures a press until it becomes a drag, so its release can
   * land outside the globe; listen for it on the window, or the press would
   * linger and a later hover would drag.
   */
  const watchRelease = (pointerId: number) => {
    const onRelease = (event: PointerEvent) => {
      const drag = dragRef.current
      if (event.pointerId === pointerId && drag && !drag.dragging) {
        forgetPress()
      }
    }
    window.addEventListener('pointerup', onRelease)
    window.addEventListener('pointercancel', onRelease)
    unwatchReleaseRef.current = () => {
      window.removeEventListener('pointerup', onRelease)
      window.removeEventListener('pointercancel', onRelease)
    }
  }

  /**
   * `released`: the pointer was lifted, so it may flick and a click follows.
   * A cancelled or lost pointer gets no click, so none is swallowed.
   */
  const endDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    released: boolean,
  ) => {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId) {
      return
    }
    forgetPress()
    if (!drag.dragging) {
      return
    }
    swallowClickRef.current = released
    const scene = sceneRef.current
    if (
      scene &&
      released &&
      !reducedMotionRef.current &&
      event.timeStamp - drag.lastTime < FLICK_WINDOW_MS
    ) {
      scene.lambda.velocity = clampSpin(drag.lambdaSpeed)
      scene.phi.velocity = clampSpin(drag.phiSpeed)
    }
    clearTimeout(holdTimerRef.current)
    holdTimerRef.current = setTimeout(() => {
      if (sceneRef.current) {
        sceneRef.current.held = false
      }
      setHeld(false)
    }, DRAG_COAST_MS)
  }

  const handlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      swallowClickRef.current = false
      const scene = sceneRef.current
      if (
        !scene ||
        dragRef.current ||
        !event.isPrimary ||
        event.button !== 0 ||
        (event.target as Element).closest('[data-globe-control]')
      ) {
        return
      }
      dragRef.current = {
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        origin: { ...scene.rotation },
        dragging: false,
        lastX: event.clientX,
        lastY: event.clientY,
        lastTime: event.timeStamp,
        lambdaSpeed: 0,
        phiSpeed: 0,
      }
      watchRelease(event.pointerId)
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      const scene = sceneRef.current
      const box = boxRef.current
      if (!drag || event.pointerId !== drag.pointerId || !scene || !box) {
        return
      }
      if (!drag.dragging) {
        // A mouse moving with no button down was released somewhere unseen.
        if (event.pointerType === 'mouse' && event.buttons === 0) {
          forgetPress()
          return
        }
        const moved = Math.hypot(
          event.clientX - drag.originX,
          event.clientY - drag.originY,
        )
        if (moved < DRAG_THRESHOLD_PX) {
          return
        }
        // It is a drag: capture now, not on the press, so a plain press on
        // a card still clicks it. Measure from here, so the globe does not
        // jump by the threshold.
        drag.dragging = true
        drag.originX = event.clientX
        drag.originY = event.clientY
        drag.origin = { ...scene.rotation }
        box.setPointerCapture?.(event.pointerId)
        clearTimeout(holdTimerRef.current)
        scene.held = true
        scene.turnedByViewer = true
        setHeld(true)
        onGrabRef.current()
      }
      const width = box.clientWidth
      const elapsed = (event.timeStamp - drag.lastTime) / 1000
      if (elapsed > 0) {
        const degreesPerPixel = dragDegreesPerPixel(width)
        drag.lambdaSpeed =
          (-(event.clientX - drag.lastX) * degreesPerPixel) / elapsed
        drag.phiSpeed =
          ((event.clientY - drag.lastY) * degreesPerPixel) / elapsed
      }
      drag.lastX = event.clientX
      drag.lastY = event.clientY
      drag.lastTime = event.timeStamp
      placeScene(
        scene,
        dragRotation(
          drag.origin,
          event.clientX - drag.originX,
          event.clientY - drag.originY,
          width,
        ),
      )
      scene.lambda.velocity = 0
      scene.phi.velocity = 0
      renderScene(scene)
    },
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) =>
      endDrag(event, true),
    // A scroll or system gesture took the pointer: stop where it is.
    onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) =>
      endDrag(event, false),
    // Capture taken from the box mid-drag: the drag ends there, without a
    // flick. A touch press starts captured by what it landed on, which loses
    // that capture to the box as the drag begins; that bubbles up here too.
    onLostPointerCapture: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        endDrag(event, false)
      }
    },
    // Only the pointer's own click ends a drag: a keyboard click (detail 0),
    // such as Enter on play, always goes through.
    onClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => {
      if (swallowClickRef.current && event.detail > 0) {
        swallowClickRef.current = false
        event.preventDefault()
        event.stopPropagation()
      }
    },
    // A native drag of the card's avatar would cancel the pointer.
    onDragStart: (event: { preventDefault: () => void }) =>
      event.preventDefault(),
  }

  return { held, handlers }
}

/**
 * The landing hero globe (design §3): Natural Earth land as a dot matrix on
 * a slowly turning orthographic globe, the cities with builders as brighter
 * dots, and one ping at a time. Every `PING_INTERVAL_MS` the next item's city
 * turns accent, emits a ring and shows its card for `PING_CARD_MS`; when the
 * card closes the globe eases round to the next city, then drifts on.
 *
 * - The server and first paint render frame 0 (the globe facing item 0,
 *   item 0 pinged, its card up) with no entrance. The card's position comes
 *   from the same projection on both sides, so the markup is deterministic
 *   and the card is visible before hydration. The canvas draws on mount.
 * - The loop (one rAF) runs only while the tab is visible and the globe is
 *   on screen, and stops when paused or unmounted.
 * - With nothing to ping, the globe still turns, with no cards.
 * - Reduced motion: a still frame facing item 0 with three items pinged and
 *   item 0's card; no timers and no rAF. The preference is followed live.
 * - A quiet pause/play control stops the cycle on the current frame (WCAG
 *   2.2.2); it appears only once the cycle can run.
 * - The viewer can drag the globe round (`useGlobeDrag`), also under reduced
 *   motion. Dragging pauses the tour, and the control then offers play.
 * - Each card links to its project, post or release; hovering it
 *   holds the tour so it can be clicked.
 *
 * The globe itself is decorative (`aria-hidden`): `HeroActivityList` gives
 * keyboards and screen readers the same items and links, and
 * `HeroMapCaption` names its cities. Only the pause control is exposed.
 */
export function PingGlobe({
  items,
  cityDots = [],
  className,
}: {
  items: ReadonlyArray<PingItem>
  /** Quiet dots for the other cities with builders. */
  cityDots?: ReadonlyArray<{ key: string } & LatLng>
  className?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hydrated = useSyncExternalStore(
    subscribeNever,
    readHydrated,
    readServerHydrated,
  )
  const pageVisible = useSyncExternalStore(
    subscribeVisibility,
    readPageVisible,
    readServerPageVisible,
  )
  const inView = useInView(rootRef)
  const prefersReducedMotion = usePrefersReducedMotion()
  const reducedMotion = hydrated && prefersReducedMotion

  const [step, setStep] = useState(0)
  const [cardOpen, setCardOpen] = useState(true)
  const [paused, setPaused] = useState(false)
  // Turning the globe by hand stops the tour; play resumes it from there.
  const pauseTour = useCallback(() => setPaused(true), [])
  // The card under the pointer, which holds still so it can be clicked.
  const [heldCardKey, setHeldCardKey] = useState<string | null>(null)

  // The first frame faces item 0, on the server and the client alike.
  const firstRotation = items[0] ? faceRotation(items[0]) : DEFAULT_ROTATION
  const sceneRef = useRef<Scene | null>(null)
  sceneRef.current ??= createScene(firstRotation)
  const drag = useGlobeDrag(sceneRef, boxRef, reducedMotion, pauseTour)

  // The globe turns whenever motion is allowed; pings need something to ping.
  const turns = hydrated && !reducedMotion
  const animates = turns && items.length > 0
  const activeIndex = items.length > 0 ? step % items.length : 0
  const card = reducedMotion
    ? items[0]
    : cardOpen
      ? items[activeIndex]
      : undefined
  const cardHeld = card !== undefined && heldCardKey === card.key
  // The turning globe, and with something to ping, the tour's timers.
  const running =
    turns && !paused && pageVisible && inView && !drag.held && !cardHeld
  const touring = running && animates
  // The loop also runs while the viewer has the globe, even when the tour
  // is paused or motion is reduced.
  const looping = hydrated && pageVisible && inView && (running || drag.held)

  // Advance to the next item; restarts from a full interval after a pause.
  useEffect(() => {
    if (!touring) {
      return
    }
    const timer = setTimeout(() => {
      setStep((current) => current + 1)
      setCardOpen(true)
    }, PING_INTERVAL_MS)
    return () => clearTimeout(timer)
  }, [touring, step])

  // Take the card down before the next ping.
  useEffect(() => {
    if (!touring || !cardOpen) {
      return
    }
    const timer = setTimeout(() => setCardOpen(false), PING_CARD_MS)
    return () => clearTimeout(timer)
  }, [touring, cardOpen, step])

  const staticPings = reducedMotion
    ? pickStaticPings(items, STATIC_PING_COUNT)
    : null
  const isActive = (index: number) =>
    staticPings ? staticPings.has(index) : index === activeIndex
  // Frame 0 is the server render: it appears without an entrance, as does
  // the still frame when reduced motion is switched on mid-cycle.
  const animateEntrance = step > 0 && !reducedMotion

  // The globe turns to the pinged city while its card is up, and to the next
  // one once the card closes, so it arrives about when that city pings.
  const turn = cardOpen ? step : step + 1
  const focus = animates ? items[turn % items.length] : items[0]

  const cities = useMemo(() => [...cityDots, ...items], [cityDots, items])

  // Keep the scene in step with each render, and place new anchors before
  // they paint.
  useLayoutEffect(() => {
    const scene = sceneRef.current
    if (!scene) {
      return
    }
    scene.cities = cities
    scene.target = focus ? faceRotation(focus) : DEFAULT_ROTATION
    if (!turns) {
      // Still frames (reduced motion, before hydration) face item 0 exactly,
      // until the viewer turns the globe themselves.
      if (!scene.turnedByViewer) {
        snapScene(scene, scene.target)
      }
    } else if (turn !== scene.turn) {
      scene.turn = turn
      scene.drift = 0
    }
    scene.anchors = [
      ...(overlayRef.current?.querySelectorAll<HTMLElement>(
        '[data-globe-anchor]',
      ) ?? []),
    ].map((element) => ({
      element,
      lat: Number(element.dataset.lat),
      lng: Number(element.dataset.lng),
    }))
    renderScene(scene)
  })

  // The canvas: created on mount, sized to its box, recoloured with the theme.
  useEffect(() => {
    const canvas = canvasRef.current
    const box = boxRef.current
    const scene = sceneRef.current
    if (!canvas || !box || !scene) {
      return
    }
    const renderer = createGlobeRenderer(canvas)
    if (!renderer) {
      return
    }
    scene.renderer = renderer
    renderer.refreshPalette()
    const measure = () => {
      renderer.resize(box.clientWidth, window.devicePixelRatio || 1)
      renderScene(scene)
    }
    measure()
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    resizeObserver?.observe(box)
    // Moving the window to a screen with another pixel ratio leaves the box
    // size unchanged, so no resize fires. A query for the current ratio
    // stops matching when it changes; re-arm it for the new ratio.
    let pixelRatioQuery: MediaQueryList | null = null
    const watchPixelRatio = () => {
      pixelRatioQuery?.removeEventListener('change', onPixelRatioChange)
      pixelRatioQuery = window.matchMedia(
        `(resolution: ${window.devicePixelRatio || 1}dppx)`,
      )
      pixelRatioQuery.addEventListener('change', onPixelRatioChange)
    }
    const onPixelRatioChange = () => {
      measure()
      watchPixelRatio()
    }
    watchPixelRatio()
    // Accent themes are a `data-theme` attribute on <html> (next-themes).
    const themeObserver = new MutationObserver(() => {
      renderer.refreshPalette()
      renderScene(scene)
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    })
    return () => {
      resizeObserver?.disconnect()
      pixelRatioQuery?.removeEventListener('change', onPixelRatioChange)
      themeObserver.disconnect()
      scene.renderer = null
    }
  }, [])

  // The animation loop: one rAF while the tour runs or the viewer has the
  // globe.
  useEffect(() => {
    const scene = sceneRef.current
    if (!looping || !scene) {
      return
    }
    let frame = 0
    let last: number | null = null
    const tick = (now: number) => {
      const dt =
        last === null ? 0 : Math.min((now - last) / 1000, MAX_FRAME_SECONDS)
      last = now
      advanceScene(scene, dt)
      renderScene(scene)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [looping])

  return (
    <div
      ref={rootRef}
      // Phones dock the card below the globe, in this reserved space.
      className={cn('w-full pb-24 sm:pb-0', className)}
    >
      <div
        ref={boxRef}
        {...drag.handlers}
        // Vertical swipes still scroll the page on touch screens.
        className="relative aspect-square w-full cursor-grab touch-pan-y select-none active:cursor-grabbing"
      >
        <div
          ref={overlayRef}
          aria-hidden="true"
          data-ping-globe=""
          className="absolute inset-0"
        >
          {/* The disc and its rim; inset matches GLOBE_RADIUS (0.46). */}
          <div className="absolute inset-[4%] rounded-full border border-line bg-radial-[at_35%_30%] from-surface to-canvas" />
          <canvas ref={canvasRef} className="absolute inset-0 size-full" />
          {items.map(
            (item, index) =>
              isActive(index) && (
                <PingMarker
                  key={item.key}
                  item={item}
                  rotation={firstRotation}
                  cycle={step}
                  still={reducedMotion}
                />
              ),
          )}
          {card && (
            <PingCard
              item={card}
              rotation={firstRotation}
              cycle={step}
              animateEntrance={animateEntrance}
              hydrated={hydrated}
              onHoldChange={(held) => setHeldCardKey(held ? card.key : null)}
            />
          )}
        </div>

        {turns && (
          <button
            type="button"
            data-globe-control=""
            onClick={() => setPaused((current) => !current)}
            aria-label={paused ? 'play map animation' : 'pause map animation'}
            className="absolute right-0 bottom-0 inline-flex h-7 cursor-pointer items-center rounded-control px-2 font-mono text-meta text-text-muted transition-colors hover:text-text pointer-coarse:min-h-11"
          >
            {paused ? 'play' : 'pause'}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * A full-box layer the loop keeps on its city: `--gx`/`--gy` place the city,
 * `--gv` fades it out on the far side. `rotation` gives the first-paint place.
 */
function anchorProps(item: PingItem, rotation: GlobeRotation) {
  return {
    'data-globe-anchor': '',
    'data-lat': item.lat,
    'data-lng': item.lng,
    style: anchorStyle(item, rotation),
    className: 'pointer-events-none absolute inset-0 opacity-(--gv)',
  }
}

/** A pinged city: an accent dot and, while it animates, one expanding ring. */
function PingMarker({
  item,
  rotation,
  cycle,
  still,
}: {
  item: PingItem
  rotation: GlobeRotation
  cycle: number
  still: boolean
}) {
  const centred =
    'absolute top-(--gy) left-(--gx) -translate-x-1/2 -translate-y-1/2 rounded-full'
  return (
    <div
      {...anchorProps(item, rotation)}
      data-ping-key={item.key}
      data-active="true"
    >
      {still ? (
        <span
          className={cn(centred, 'size-7 border border-brand opacity-35')}
        />
      ) : (
        <m.span
          key={cycle}
          className={cn(centred, 'size-4 border-2 border-brand')}
          initial={{ scale: 0.4, opacity: 0.8 }}
          animate={{ scale: 3.2, opacity: 0 }}
          transition={{ duration: 1.2, ease: easeOutExpo }}
        />
      )}
      <span className={cn(centred, 'size-2.5 bg-brand')} />
    </div>
  )
}

/**
 * The card attached to the pinged city. From `sm` it floats beside the city,
 * opening towards the middle of the globe and downward (see
 * `CARD_OPENS_DOWN_ABOVE`), judged where the city rests when faced, so it
 * stays over the globe. Phones dock it full width below
 * the globe, with a hairline up to the city.
 */
function PingCard({
  item,
  rotation,
  cycle,
  animateEntrance,
  hydrated,
  onHoldChange,
}: {
  item: PingItem
  rotation: GlobeRotation
  cycle: number
  animateEntrance: boolean
  hydrated: boolean
  onHoldChange: (held: boolean) => void
}) {
  const rest = toBoxFraction(projectToGlobe(item, faceRotation(item)))
  const opensRight = rest.left < 0.5
  // From the city to the box edge the card opens towards, less the drift.
  const room = (opensRight ? 1 - rest.left : rest.left) - CARD_DRIFT_ROOM
  const cardMax = {
    '--card-max': `min(20rem, ${(room * 100).toFixed(1)}%)`,
  } as CSSProperties
  return (
    <div {...anchorProps(item, rotation)}>
      <div className="absolute top-(--gy) -bottom-3 left-(--gx) w-px bg-brand/50 sm:hidden" />
      <div
        style={cardMax}
        className={cn(
          'pointer-events-auto absolute top-full right-0 left-0 mt-3',
          'sm:top-(--gy) sm:right-auto sm:left-(--gx) sm:mt-0 sm:w-max sm:max-w-(--card-max)',
          opensRight ? 'sm:-translate-x-2' : 'sm:-translate-x-[calc(100%-8px)]',
          rest.top <= CARD_OPENS_DOWN_ABOVE
            ? 'sm:translate-y-4'
            : 'sm:-translate-y-[calc(100%+16px)]',
        )}
      >
        <m.div
          key={`${item.key}:${cycle}`}
          data-ping-card={item.key}
          className="rounded-card border border-line bg-surface shadow-floating transition-colors hover:border-brand"
          initial={animateEntrance ? { opacity: 0, y: 6 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: easeOutExpo }}
          onPointerEnter={() => onHoldChange(true)}
          onPointerLeave={() => onHoldChange(false)}
        >
          {/* Out of the tab order: it moves on its own. HeroActivityList
              lists the same links for keyboards and screen readers. */}
          <Link
            to="/project/$owner/$repo"
            params={{ owner: item.link.owner, repo: item.link.repo }}
            search={item.link.search}
            tabIndex={-1}
            draggable={false}
            className="block cursor-pointer px-3 py-2"
          >
            <PingCardBody item={item} hydrated={hydrated} />
          </Link>
        </m.div>
      </div>
    </div>
  )
}

const KIND_LABELS: Record<PingItem['kind'], string> = {
  post: 'POST',
  release: 'RELEASE',
  push: 'SHIPPED',
  project: 'PROJECT',
}

function PingCardBody({
  item,
  hydrated,
}: {
  item: PingItem
  hydrated: boolean
}) {
  // The age depends on the clock, so it appears only after hydration.
  const age = hydrated ? relativeTime(item.at) : null
  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        {item.avatarUrl ? (
          <LxAvatar
            name={item.headline}
            avatarUrl={item.avatarUrl}
            size={18}
            decorative
          />
        ) : (
          <span className="shrink-0 text-brand">◉</span>
        )}
        <span className="line-clamp-2 min-w-0 font-sans text-label font-medium wrap-anywhere text-text">
          {item.headline}
        </span>
      </div>
      {item.detail && (
        <p className="mt-1 line-clamp-2 font-sans text-meta wrap-anywhere text-text-muted">
          {item.detail}
        </p>
      )}
      <div className="mt-1 text-eyebrow wrap-anywhere text-place">
        ▸ <span className="text-brand">{KIND_LABELS[item.kind]}</span>
        {' · '}
        {item.place}
        {age && ` · ${age}`}
      </div>
    </>
  )
}
