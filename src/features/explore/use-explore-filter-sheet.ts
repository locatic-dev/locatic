import { useEffect, useRef, useState } from 'react'
import { focusExploreCityHeading } from '@/features/explore/components/explore-rail'

/** Matches Tailwind's `xl` breakpoint, where the rail replaces the sheet. */
export const RAIL_MEDIA_QUERY = '(min-width: 80rem)'

/** Where focus lands when the sheet opens: the sheet, or its city field. */
export type ExploreFilterSheetFocus = 'default' | 'city'

/**
 * The filter sheet's lifecycle below `xl`: open state, where focus lands on
 * open, and where it returns on close. Radix only restores focus to a
 * DialogTrigger; the sheet opens from plain buttons, so the opener is
 * remembered and refocused on close. The rail replaces the sheet at `xl`, so
 * a sheet left open while the window widens closes, and focus continues in
 * the rail rather than on the (now hidden) opener.
 */
export function useExploreFilterSheet() {
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState<ExploreFilterSheetFocus>('default')
  const openerRef = useRef<HTMLElement | null>(null)

  const openSheet = (nextFocus: ExploreFilterSheetFocus) => {
    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setFocus(nextFocus)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const railQuery = window.matchMedia(RAIL_MEDIA_QUERY)
    const closeAtRail = () => {
      if (railQuery.matches) setOpen(false)
    }
    closeAtRail()
    railQuery.addEventListener('change', closeAtRail)
    return () => railQuery.removeEventListener('change', closeAtRail)
  }, [open])

  const onCloseAutoFocus = (event: Event) => {
    event.preventDefault()
    // At xl the filters button is hidden; continue in the rail.
    if (window.matchMedia(RAIL_MEDIA_QUERY).matches) {
      focusExploreCityHeading('rail')
      return
    }
    const opener = openerRef.current
    openerRef.current = null
    if (opener?.isConnected) opener.focus()
  }

  return {
    open,
    openSheet,
    /** Spread onto `ExploreFilterSheet`. */
    sheetProps: { open, onOpenChange: setOpen, focus, onCloseAutoFocus },
  }
}
