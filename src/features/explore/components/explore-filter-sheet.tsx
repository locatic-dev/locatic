import { useRef, type ComponentProps, type ReactNode } from 'react'
import { Dialog, DialogTitle, SheetContent } from '@/components/ui/dialog'
import { focusExploreCityInput } from './explore-rail'

/**
 * The rail's content below `xl`: a bottom sheet on phones, a right drawer on
 * tablets. Opened from "choose another city", it lands on the city field;
 * otherwise focus goes to the sheet itself, so a phone does not raise its
 * keyboard for the city field first. Closing returns focus to the button
 * that opened it unless `onCloseAutoFocus` prevents that. Titled like the
 * rail's landmark ("explore filters"), which also keeps it apart from the
 * rail's own "filters" section.
 */
export function ExploreFilterSheet({
  children,
  focus,
  onCloseAutoFocus,
  onOpenChange,
  open,
}: {
  children: ReactNode
  focus: 'default' | 'city'
  onCloseAutoFocus?: ComponentProps<typeof SheetContent>['onCloseAutoFocus']
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={contentRef}
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          if (focus === 'city') {
            focusExploreCityInput('sheet')
          } else {
            contentRef.current?.focus()
          }
        }}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogTitle className="text-eyebrow text-text-muted">
          explore filters
        </DialogTitle>
        {children}
      </SheetContent>
    </Dialog>
  )
}
