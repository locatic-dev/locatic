import { motion, useScroll, useTransform } from 'motion/react'
import type { ReactNode } from 'react'
import { useReducedMotion } from '@/lib/motion'

// Wraps the hero dot-map background so it drifts slower than the page as the
// visitor scrolls — a subtle depth cue, never competing with foreground
// content. Scroll-linked style motion values bypass MotionConfig's
// reducedMotion handling, so gate explicitly.
export function DotMapParallax({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const reducedMotion = useReducedMotion()
  const { scrollY } = useScroll()
  const parallaxY = useTransform(scrollY, [0, 600], [0, 90])

  return (
    <motion.div
      className={className}
      style={{ y: reducedMotion ? 0 : parallaxY }}
    >
      {children}
    </motion.div>
  )
}
