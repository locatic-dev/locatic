import * as React from 'react'

import { cn } from '@/lib/utils'

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<'textarea'>
>(({ className, id, ...props }, ref) => {
  const fallbackId = React.useId()

  return (
    <textarea
      id={id ?? fallbackId}
      className={cn(
        // Same field recipe as Input: mono, 16px below md so touch browsers do
        // not zoom, fixed height (resize-none) with a 72px floor.
        'block min-h-18 w-full resize-none rounded-control border border-control bg-canvas px-3 py-2 font-mono text-body text-text placeholder:text-text-muted disabled:cursor-not-allowed disabled:opacity-50 max-md:text-base',
        className,
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = 'Textarea'

export { Textarea }
