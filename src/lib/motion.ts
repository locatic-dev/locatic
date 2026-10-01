import { useReducedMotion } from 'motion/react'
import type { Transition, Variants } from 'motion/react'
import { useSyncExternalStore } from 'react'

// Shared motion vocabulary. Import variants from here instead of redefining
// per feature so entrance/press behavior stays uniform across surfaces.
// MotionConfig (reducedMotion="user") is set globally in __root.tsx; variants
// Transform-only entrance variants are auto-disabled for reduced motion.

export const easeOutExpo = [0.16, 1, 0.3, 1] as const

export const durations = {
  fast: 0.14,
  base: 0.24,
  slow: 0.4,
} as const

export const fadeUp: Variants = {
  hidden: { y: 6 },
  visible: {
    y: 0,
    transition: { duration: durations.base, ease: easeOutExpo },
  },
}

// Parent wrapper for staggered list entrances. Apply to the list container
// with `initial="hidden" animate="visible"`, and `fadeUp` on each child.
// First page only — never re-stagger on pagination appends.
export const listStagger: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06 },
  },
}

// Default `viewport` for whileInView scroll reveals: fire once, when a
// quarter of the element is visible. Never re-animate on scroll-back.
export const viewportOnce = { once: true, amount: 0.25 } as const

// Press feedback for buttons/chips: spread as `whileTap={pressScale}`.
export const pressScale = { scale: 0.97 } as const

// Spring for shared-layout indicators (nav active bar, tab underline).
export const indicatorSpring: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 40,
}

export { useReducedMotion }

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function reducedMotionQuery() {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function'
    ? window.matchMedia(REDUCED_MOTION_QUERY)
    : null
}

function subscribeReducedMotion(onChange: () => void) {
  const query = reducedMotionQuery()
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}

const readReducedMotion = () => reducedMotionQuery()?.matches ?? false
// The server cannot know the preference: it renders the full-motion markup,
// and the client re-renders with the real value right after hydration.
const readServerReducedMotion = () => false

/**
 * Live `prefers-reduced-motion`. Motion's `useReducedMotion` reads the query
 * once per mount; this follows the setting when the viewer changes it, for
 * loops that must stop at once rather than on the next page load.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    readReducedMotion,
    readServerReducedMotion,
  )
}
