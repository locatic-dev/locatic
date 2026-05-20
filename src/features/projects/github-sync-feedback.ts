import { toast } from 'sonner'

type LikeSyncResult = {
  githubSyncAttempted: boolean
  githubSyncSucceeded: boolean
  githubSyncError: string | null
}

export function showGithubSyncFeedback(
  result: LikeSyncResult | null | undefined,
) {
  if (!result?.githubSyncAttempted || result.githubSyncSucceeded) {
    return
  }

  toast.message('Saved on Locatic, but GitHub sync needs attention.', {
    description:
      result.githubSyncError ??
      'Your like was saved here, but GitHub could not sync this repo star.',
  })
}
