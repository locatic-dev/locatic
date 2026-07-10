import { useReducedMotion } from 'motion/react'
import type { Transition, Variants } from 'motion/react'

// Shared motion vocabulary. Import variants from here instead of redefining
// per feature so entrance/press behavior stays uniform across surfaces.
// MotionConfig (reducedMotion="user") is set globally in __root.tsx; variants
// that only animate transform/opacity are auto-disabled for reduced motion.

export const easeOutExpo = [0.16, 1, 0.3, 1] as const

export const durations = {
  fast: 0.14,
  base: 0.24,
  slow: 0.4,
} as const

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: durations.base, ease: easeOutExpo },
  },
}

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
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
