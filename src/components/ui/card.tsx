import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

// The one shared card container. Replaces the ~18 hand-rolled
// `rounded-card border border-line bg-surface px-? py-?` recipes so every card
// on the platform shares one containment layer and one density scale. Consumes
// tokens by name only — no colors declared here.
const cardVariants = cva('rounded-card border border-line bg-surface', {
  variants: {
    density: {
      // Spacious — a featured, standalone card.
      cozy: 'px-5 py-4',
      // Default — list/feed rhythm.
      compact: 'px-4 py-3',
      // No padding — a bordered-list shell whose rows own their own padding.
      flush: 'p-0',
    },
    // A clickable card. Adds the `.lx-card` resting lift + hover treatment and
    // the press/focus affordances, mirroring the ProjectCard container exactly.
    // Static/flush cards stay a clean flat border — no whole-panel hover wash.
    interactive: {
      true: 'lx-card cursor-pointer transition-transform duration-[140ms] ease-out active:scale-[0.997] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
      false: '',
    },
  },
  defaultVariants: {
    density: 'compact',
    interactive: false,
  },
})

export interface CardProps
  extends HTMLAttributes<HTMLElement>, VariantProps<typeof cardVariants> {
  /** Render as a different element (e.g. `article`, `section`). Defaults to `div`. */
  as?: ElementType
  children?: ReactNode
}

export function Card({
  as,
  density,
  interactive,
  className,
  children,
  ...props
}: CardProps) {
  const Comp = as ?? 'div'
  return (
    <Comp
      className={cn(cardVariants({ density, interactive }), className)}
      {...props}
    >
      {children}
    </Comp>
  )
}

// Exported so clickable cards built on a typed element that `Card`'s `as` can't
// cleanly carry (e.g. a TanStack `Link` with route params) can share the exact
// same container recipe: `className={cn(cardVariants({ density, interactive }), …)}`.
export { cardVariants }
