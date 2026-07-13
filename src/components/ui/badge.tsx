import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex min-h-6 items-center gap-1 rounded-pill border px-2.5 py-0.5 font-mono text-[11px] leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
  {
    variants: {
      variant: {
        default: 'border-brand/30 bg-brand-quiet text-brand',
        secondary: 'border-line bg-surface-alt text-text-muted',
        destructive: 'border-liked/30 bg-liked/10 text-liked',
        outline: 'border-line bg-transparent text-text-muted',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
