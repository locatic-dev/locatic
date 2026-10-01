import * as React from 'react'

import { cn } from '@/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, id, type, ...props }, ref) => {
    const fallbackId = React.useId()

    return (
      <input
        type={type}
        id={id ?? fallbackId}
        className={cn(
          // Mono per DESIGN.md §5; 15px (body size) from md up, 16px below so
          // touch browsers do not zoom on focus. Focus uses the global rule.
          'flex h-10 w-full rounded-control border border-control bg-canvas px-3 py-2 font-mono text-body text-text placeholder:text-text-muted file:border-0 file:bg-transparent file:text-label file:text-text disabled:cursor-not-allowed disabled:opacity-50 max-md:text-base',
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'

export { Input }
