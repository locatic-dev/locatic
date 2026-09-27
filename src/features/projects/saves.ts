import { convexQuery } from '@convex-dev/react-query'
import { useMutation } from 'convex/react'
import { useRef, useState } from 'react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { reportActionError } from '@/lib/action-error'
import { showUndoToast } from '@/lib/undo-toast'

/** Cards per page on `/saved`. */
export const SAVED_PAGE_SIZE = 12

/**
 * Which of these projects the signed-in viewer has saved (empty for
 * visitors). The server accepts at most 40 ids, one page of cards.
 */
export const savedStateQueryOptions = (
  projectIds: Id<'projects'>[],
  ready = true,
) =>
  convexQuery(
    api.projects.getSavedState,
    ready && projectIds.length > 0 ? { projectIds } : 'skip',
  )

/**
 * Save/unsave with one request in flight per project. Removing a save shows
 * an undo toast; a failure is reported with a retry. Saved state itself comes
 * from the live `getSavedState`/`listSaved` subscriptions.
 */
export function useProjectSaveToggle() {
  const save = useMutation(api.projects.save)
  const unsave = useMutation(api.projects.unsave)
  const pendingRef = useRef(new Set<string>())
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )

  const setPending = (key: string, pending: boolean) => {
    if (pending) {
      pendingRef.current.add(key)
    } else {
      pendingRef.current.delete(key)
    }
    setPendingIds(new Set(pendingRef.current))
  }

  const toggle = async (args: {
    projectId: Id<'projects'>
    /** "owner/repo", used in the undo message. */
    projectName: string
    saved: boolean
  }): Promise<void> => {
    const { projectId, projectName, saved } = args
    const key = String(projectId)
    if (pendingRef.current.has(key)) {
      return
    }

    setPending(key, true)
    try {
      await (saved ? unsave({ projectId }) : save({ projectId }))
    } catch (error) {
      reportActionError(error, {
        title: saved ? "couldn't remove from saved" : "couldn't save",
        retry: () => toggle(args),
      })
      return
    } finally {
      setPending(key, false)
    }

    if (saved) {
      showUndoToast({
        message: `removed ${projectName} from saved`,
        undo: () => save({ projectId }),
      })
    }
  }

  return {
    toggle,
    isPending: (projectId: Id<'projects'>) => pendingIds.has(String(projectId)),
  }
}
