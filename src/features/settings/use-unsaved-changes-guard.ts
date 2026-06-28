import { useBlocker } from '@tanstack/react-router'
import type { RefObject } from 'react'

/**
 * Warns before leaving a form with unsaved edits. Covers in-app navigation
 * (tab switches, sidebar links) via the router blocker and full reloads/closes
 * via the native beforeunload prompt. Uses the same window.confirm idiom as the
 * rest of settings so there is no extra modal to maintain.
 */
export function useUnsavedChangesGuard(
  isDirty: boolean,
  allowNextNavigationRef?: RefObject<boolean>,
) {
  useBlocker({
    enableBeforeUnload: isDirty,
    shouldBlockFn: () => {
      if (allowNextNavigationRef?.current) {
        allowNextNavigationRef.current = false
        return false
      }
      if (!isDirty) {
        return false
      }
      return !window.confirm('You have unsaved changes. Leave without saving?')
    },
  })
}
