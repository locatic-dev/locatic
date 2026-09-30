import * as m from 'motion/react-m'
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type RefObject,
} from 'react'
import { getLandDots } from '@/components/ui/dot-map'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { easeOutExpo, usePrefersReducedMotion } from '@/lib/motion'
import { relativeTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import {
  PING_CARD_MS,
  PING_INTERVAL_MS,
  type PingItem,
} from './landing-content'

const MAP_WIDTH = 1200
const MAP_HEIGHT = 420
const LAND_DOTS = getLandDots(MAP_WIDTH, MAP_HEIGHT)

/** Cities the reduced-motion frame shows pinged at once. */
const STATIC_PING_COUNT = 3

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
 * The reduced-motion frame: the first items on distinct dots (several pings
 * on one dot would read as one), then the rest in order.
 */
export function pickStaticPings(
  items: ReadonlyArray<Pick<PingItem, 'x' | 'y'>>,
  count: number,
): Set<number> {
  const chosen: number[] = []
  const dots = new Set<string>()
  items.forEach((item, index) => {
    const dot = `${item.x}:${item.y}`
    if (chosen.length < count && !dots.has(dot)) {
      dots.add(dot)
      chosen.push(index)
    }
  })
  for (let index = 0; index < items.length && chosen.length < count; index++) {
    if (!chosen.includes(index)) {
      chosen.push(index)
    }
  }
  return new Set(chosen)
}

/** Whether the map is on screen; true until an observer says otherwise. */
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

/**
 * The landing hero map (design §3): the land mask as a dot matrix, the cities
 * with builders as brighter dots, and one ping at a time. Every
 * `PING_INTERVAL_MS` the next item's dot turns accent, emits a ring and shows
 * its card for `PING_CARD_MS`.
 *
 * - The server and first paint render frame 0 (item 0 pinged, its card up)
 *   with no entrance, so the markup is deterministic and the card is visible
 *   before hydration.
 * - The cycle runs only while the tab is visible and the map is on screen.
 * - Reduced motion: a static frame with the first three items pinged and item
 *   0's card; no timers. The preference is followed live.
 * - A quiet pause/play control stops the cycle on the current frame (WCAG
 *   2.2.2); it appears only once the cycle can run.
 *
 * The map itself is decorative (`aria-hidden`): `HeroMapCaption` carries its
 * content. Only the pause control is exposed.
 */
export function PingMap({
  items,
  cityDots = [],
  className,
}: {
  items: ReadonlyArray<PingItem>
  /** Quiet dots for the other cities with builders, as mask fractions. */
  cityDots?: ReadonlyArray<{ key: string; x: number; y: number }>
  className?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
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
  const drawOrder = items
    .map((_, index) => index)
    .sort((a, b) => Number(isActive(a)) - Number(isActive(b)))
  const card = reducedMotion
    ? items[0]
    : cardOpen
      ? items[activeIndex]
      : undefined
  // Frame 0 is the server render: it appears without an entrance.
  const animateEntrance = step > 0

  return (
    <div
      ref={rootRef}
      // Phones dock the card below the map, in this reserved space.
      className={cn('mx-auto w-full max-w-360 pb-24 sm:pb-0', className)}
    >
      <div className="relative">
        <div aria-hidden="true" data-ping-map="">
          <svg
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            width={MAP_WIDTH}
            height={MAP_HEIGHT}
            className="block h-auto w-full overflow-visible"
          >
            {/* Dots scale with the full-bleed map; phones draw them larger in
              map units so they stay above a pixel. */}
            <g
              fill="var(--lx-text-2)"
              opacity={0.45}
              className="max-sm:[&>circle]:[r:5px]"
            >
              {LAND_DOTS.map((dot) => (
                <circle
                  key={`${dot.x}:${dot.y}`}
                  cx={dot.x}
                  cy={dot.y}
                  r={2.4}
                />
              ))}
            </g>
            <g
              fill="var(--lx-text)"
              opacity={0.7}
              className="max-sm:[&>circle]:[r:6px]"
            >
              {cityDots.map((dot) => (
                <circle
                  key={dot.key}
                  cx={dot.x * MAP_WIDTH}
                  cy={dot.y * MAP_HEIGHT}
                  r={3.2}
                />
              ))}
            </g>
            {/* Pinged items draw last, above quiet items on the same dot. */}
            {drawOrder.map((index) => {
              const item = items[index]
              const active = isActive(index)
              const cx = item.x * MAP_WIDTH
              const cy = item.y * MAP_HEIGHT
              return (
                <g
                  key={item.key}
                  data-ping-key={item.key}
                  data-active={active ? 'true' : 'false'}
                >
                  {active && reducedMotion && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={14}
                      fill="none"
                      stroke="var(--lx-accent)"
                      strokeWidth={1.5}
                      opacity={0.35}
                      className="max-sm:[r:28px]"
                    />
                  )}
                  {active && !reducedMotion && (
                    <m.circle
                      key={step}
                      cx={cx}
                      cy={cy}
                      r={8}
                      fill="none"
                      stroke="var(--lx-accent)"
                      strokeWidth={2}
                      className="origin-center [transform-box:fill-box] max-sm:[r:16px]"
                      initial={{ scale: 0.4, opacity: 0.8 }}
                      animate={{ scale: 3.2, opacity: 0 }}
                      transition={{ duration: 1.2, ease: easeOutExpo }}
                    />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={active ? 5 : 3.6}
                    fill={active ? 'var(--lx-accent)' : 'var(--lx-text)'}
                    className={active ? 'max-sm:[r:9px]' : 'max-sm:[r:7px]'}
                  />
                </g>
              )
            })}
          </svg>

          {card && (
            <PingCard
              item={card}
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
 * The card attached to the pinged dot. From `sm` it floats beside the dot and
 * opens towards the middle of the map, so it never leaves it. Phones dock it
 * full width below the map, with a hairline up to the dot.
 */
function PingCard({
  item,
  cycle,
  animateEntrance,
  hydrated,
}: {
  item: PingItem
  cycle: number
  animateEntrance: boolean
  hydrated: boolean
}) {
  const position = {
    '--ping-x': `${item.x * 100}%`,
    '--ping-y': `${item.y * 100}%`,
  } as CSSProperties
  return (
    <>
      <div
        className="pointer-events-none absolute top-(--ping-y) -bottom-3 left-(--ping-x) w-px bg-brand/50 sm:hidden"
        style={position}
      />
      <div
        className={cn(
          'pointer-events-none absolute top-full right-(--lx-gutter) left-(--lx-gutter) mt-3',
          'sm:top-(--ping-y) sm:right-auto sm:left-(--ping-x) sm:mt-0 sm:w-max sm:max-w-80',
          item.x < 0.5
            ? 'sm:-translate-x-2'
            : 'sm:-translate-x-[calc(100%-8px)]',
          item.y <= 0.5
            ? 'sm:translate-y-4'
            : 'sm:-translate-y-[calc(100%+16px)]',
        )}
        style={position}
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
    </>
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
