import type { ReactNode } from 'react'
import { LOCATIC_DEFINITION } from '@/features/about/about-content'
import { AboutLetter } from '@/features/about/about-letter'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

// The founders' letter (shared with /about). Pass a `children` trigger, or
// drive it with `open`/`onOpenChange` from a menu item (in-app account menu).
export function AboutDialog({
  children,
  open,
  onOpenChange,
}: {
  children?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="max-h-[85dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <p className="text-eyebrow text-brand">A note from the builders</p>
          <DialogTitle className="text-headline">
            It started with a question
          </DialogTitle>
          <DialogDescription className="sr-only">
            Why we built Locatic and where we want to take it.
          </DialogDescription>
        </DialogHeader>

        <p className="text-body text-text">{LOCATIC_DEFINITION}</p>

        <AboutLetter headingLevel="h3" />
      </DialogContent>
    </Dialog>
  )
}
