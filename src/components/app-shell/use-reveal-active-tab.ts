import { useEffect, type RefObject } from 'react'

/**
 * Keeps the current tab (`[aria-current="true"]`) fully visible inside a tab
 * row that scrolls sideways on narrow screens. Only the row scrolls:
 * `scrollIntoView` would also move the page vertically, and on load the row is
 * often below the fold. Offsets are relative to the row, so it must be the
 * tabs' offset parent (give it `position: relative`).
 */
export function useRevealActiveTab(
  rowRef: RefObject<HTMLElement | null>,
  activeKey: string,
) {
  useEffect(() => {
    const row = rowRef.current
    const active = row?.querySelector<HTMLElement>('[aria-current="true"]')
    if (!row || !active) {
      return
    }

    const left = active.offsetLeft
    const right = left + active.offsetWidth
    if (left < row.scrollLeft) {
      row.scrollLeft = left
    } else if (right > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = right - row.clientWidth
    }
  }, [rowRef, activeKey])
}
