import { useState } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import { reportActionError } from '@/lib/action-error'
import { useRefreshProjectMetadata } from '@/features/projects/mutations'

/**
 * Owner recovery for a failed or stale GitHub sync: re-runs the metadata
 * refresh (owner-only and rate-limited on the server) and reports a failure
 * with its reason. Pass the result to `ProjectCard`'s `onRetrySync`.
 */
export function useRefreshProjectSync(onRefreshed?: () => Promise<unknown>) {
  const refreshProjectMetadata = useRefreshProjectMetadata()
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null)

  const refresh = async (projectId: Id<'projects'>) => {
    if (pendingProjectId !== null) {
      return
    }

    setPendingProjectId(String(projectId))
    try {
      await refreshProjectMetadata({ projectId })
      await onRefreshed?.()
    } catch (error) {
      reportActionError(error, {
        title: "couldn't refresh from GitHub",
        retry: () => refresh(projectId),
      })
    } finally {
      setPendingProjectId(null)
    }
  }

  return { pendingProjectId, refresh }
}
