import * as React from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A native `<select>` styled like `Input`, with its own chevron so the arrow
 * keeps a fixed gap from the border. Forced-colors mode gets the browser's
 * arrow back. `className` goes to the select; `wrapperClassName` sizes the
 * whole control.
 */
const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<'select'> & { wrapperClassName?: string }
>(({ className, wrapperClassName, ...props }, ref) => (
  <div className={cn('relative', wrapperClassName)}>
    <select
      ref={ref}
      className={cn(
        // 16px below md so touch browsers do not zoom on focus, as in Input.
        'h-10 w-full min-w-0 appearance-none rounded-control border border-control bg-canvas py-0 pr-9 pl-3 font-mono text-label text-text disabled:cursor-not-allowed disabled:opacity-50 max-md:text-base pointer-coarse:h-11 forced-colors:appearance-auto forced-colors:pr-3',
        className,
      )}
      {...props}
    />
    <ChevronDown
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-text-muted forced-colors:hidden"
    />
  </div>
))
NativeSelect.displayName = 'NativeSelect'

export { NativeSelect }
