import type { ElementType, HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/utils'

// A seamless "feed sheet": one rounded, bordered panel whose direct children are
// divider-separated rows with NO gap between them — the X.com / Instagram feed
// rhythm. Cards placed inside render frameless (rounded-none border-0); the sheet
// owns the outer frame and the hairline between rows via `divide-y`.
//
// `overflow-hidden` clips the rows to the sheet's rounded corners, so in-sheet
// interactive cards must use an INSET focus ring (focus-visible:ring-inset,
// no ring-offset) — an offset ring would be clipped on the first/last row.
//
// Exported as a class too, so motion-animated lists (InitialPageMotionList, which
// wraps each item in its own element) can apply it to their list root and still
// get one divider per row.
export const cardSheetClass =
  'overflow-hidden rounded-card border border-line bg-surface divide-y divide-line'

export interface CardSheetProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType
  children?: ReactNode
}

export function CardSheet({
  as,
  className,
  children,
  ...props
}: CardSheetProps) {
  const Comp = as ?? 'div'
  return (
    <Comp className={cn(cardSheetClass, className)} {...props}>
      {children}
    </Comp>
  )
}
