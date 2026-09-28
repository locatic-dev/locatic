import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

// Product buttons (DESIGN.md §5): mono label text, 4px control radius, no
// resting shadow. Focus comes from the global `:focus-visible` rule in
// styles.css, so no ring classes here.
//   primary   — brand fill; one per surface (post, reply, save).
//   secondary — the default: control border, muted text (follow, edit, cancel).
//   ghost     — no border, faint text (mark read, inline actions).
//   danger    — solid danger fill with the dark danger foreground; reserved for
//               the confirming step of a destructive action (delete account,
//               delete post). Entry points that open a confirmation use
//               secondary, so danger never competes with the page's primary.
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control border text-label transition-colors disabled:pointer-events-none disabled:cursor-default disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'border-transparent bg-brand font-semibold text-brand-foreground hover:bg-brand/90',
        secondary:
          'border-control bg-transparent text-text-muted hover:border-line-strong hover:text-text',
        ghost:
          'border-transparent bg-transparent text-text-faint hover:bg-state-hover hover:text-text',
        danger:
          'border-transparent bg-danger font-semibold text-destructive-foreground hover:bg-danger/90',
      },
      size: {
        sm: 'h-7 px-3',
        meta: 'h-8 px-3.5',
        md: 'h-9 px-4',
        icon: 'size-8 px-0',
        // Mobile shell and full-width touch actions: a 44px target.
        touch: 'min-h-11 px-4',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
)

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render the single child (e.g. a router `Link`) with button styling. */
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button }
export type { ButtonVariant, ButtonSize }
