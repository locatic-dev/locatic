import * as m from 'motion/react-m'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type RefObject,
} from 'react'
import { LxAvatar } from '@/components/ui/lx-avatar'
import type { LatLng } from '@/lib/geo'
import { easeOutExpo, usePrefersReducedMotion } from '@/lib/motion'
import { relativeTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import {
  anchorVariables,
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
  }
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

function writeAnchor(anchor: Anchor, rotation: GlobeRotation) {
  const variables = anchorVariables(anchor, rotation)
  anchor.element.style.setProperty('--gx', variables['--gx'])
  anchor.element.style.setProperty('--gy', variables['--gy'])
  anchor.element.style.setProperty('--gv', variables['--gv'])
}

function renderScene(scene: Scene) {
  scene.renderer?.draw(scene.rotation, scene.cities)
  for (const anchor of scene.anchors) {
    writeAnchor(anchor, scene.rotation)
  }
}

/** Inline custom properties that place an anchor on first paint. */
function anchorStyle(point: LatLng, rotation: GlobeRotation): CSSProperties {
  return anchorVariables(point, rotation) as CSSProperties
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
 * - Reduced motion: a still frame facing item 0 with three items pinged and
 *   item 0's card; no timers and no rAF. The preference is followed live.
 * - A quiet pause/play control stops the cycle on the current frame (WCAG
 *   2.2.2); it appears only once the cycle can run.
 *
 * The globe itself is decorative (`aria-hidden`): `HeroMapCaption` carries
 * its content. Only the pause control is exposed.
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
  const animates = hydrated && !reducedMotion && items.length > 0
  const running = animates && !paused && pageVisible && inView

  // Advance to the next item; restarts from a full interval after a pause.
  useEffect(() => {
    if (!running) {
      return
    }
    const timer = setTimeout(() => {
      setStep((current) => current + 1)
      setCardOpen(true)
    }, PING_INTERVAL_MS)
    return () => clearTimeout(timer)
  }, [running, step])

  // Take the card down before the next ping.
  useEffect(() => {
    if (!running || !cardOpen) {
      return
    }
    const timer = setTimeout(() => setCardOpen(false), PING_CARD_MS)
    return () => clearTimeout(timer)
  }, [running, cardOpen, step])

  const activeIndex = items.length > 0 ? step % items.length : 0
  const staticPings = reducedMotion
    ? pickStaticPings(items, STATIC_PING_COUNT)
    : null
  const isActive = (index: number) =>
    staticPings ? staticPings.has(index) : index === activeIndex
  const card = reducedMotion
    ? items[0]
    : cardOpen
      ? items[activeIndex]
      : undefined
  // Frame 0 is the server render: it appears without an entrance, as does
  // the still frame when reduced motion is switched on mid-cycle.
  const animateEntrance = step > 0 && !reducedMotion

  // The first frame faces item 0, on the server and the client alike.
  const firstRotation = items[0] ? faceRotation(items[0]) : DEFAULT_ROTATION
  // The globe turns to the pinged city while its card is up, and to the next
  // one once the card closes, so it arrives about when that city pings.
  const turn = cardOpen ? step : step + 1
  const focus = animates ? items[turn % items.length] : items[0]

  const cities = useMemo(() => [...cityDots, ...items], [cityDots, items])
  const sceneRef = useRef<Scene | null>(null)
  sceneRef.current ??= createScene(firstRotation)

  // Keep the scene in step with each render, and place new anchors before
  // they paint.
  useLayoutEffect(() => {
    const scene = sceneRef.current
    if (!scene) {
      return
    }
    scene.cities = cities
    scene.target = focus ? faceRotation(focus) : DEFAULT_ROTATION
    if (!animates) {
      // Still frames (reduced motion, nothing to ping) face item 0 exactly.
      snapScene(scene, scene.target)
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

  // The animation loop: one rAF while the cycle runs.
  useEffect(() => {
    const scene = sceneRef.current
    if (!running || !scene) {
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
  }, [running])

  return (
    <div
      ref={rootRef}
      // Phones dock the card below the globe, in this reserved space.
      className={cn('w-full pb-24 sm:pb-0', className)}
    >
      <div ref={boxRef} className="relative aspect-square w-full">
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
            />
          )}
        </div>

        {animates && (
          <button
            type="button"
            onClick={() => setPaused((current) => !current)}
            aria-label={paused ? 'play map animation' : 'pause map animation'}
            className="absolute right-0 bottom-0 inline-flex h-7 items-center rounded-control px-2 font-mono text-meta text-text-muted transition-colors hover:text-text pointer-coarse:min-h-11"
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
}: {
  item: PingItem
  rotation: GlobeRotation
  cycle: number
  animateEntrance: boolean
  hydrated: boolean
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
          'absolute top-full right-0 left-0 mt-3',
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
          className="rounded-card border border-line bg-surface px-3 py-2 shadow-floating"
          initial={animateEntrance ? { opacity: 0, y: 6 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: easeOutExpo }}
        >
          <PingCardBody item={item} hydrated={hydrated} />
        </m.div>
      </div>
    </div>
  )
}

function PingCardBody({
  item,
  hydrated,
}: {
  item: PingItem
  hydrated: boolean
}) {
  // The age depends on the clock, so it appears only after hydration.
  const age = hydrated && item.at !== null ? relativeTime(item.at) : null
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
      <div className="mt-1 text-eyebrow wrap-anywhere text-place">
        ▸ {item.example && 'EXAMPLE · '}
        {item.place}
        {age && ` · ${age}`}
      </div>
    </>
  )
}
