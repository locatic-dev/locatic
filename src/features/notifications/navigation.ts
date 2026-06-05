import type { NotificationTarget } from '@/features/contracts'

function getConversationInboxSearch(
  conversationId: string,
  inboxTab?: 'inbox' | 'requests' | null,
) {
  return {
    conversation: conversationId,
    tab: inboxTab === 'requests' ? 'requests' : 'inbox',
  } as const
}

export function getNotificationDestination(
  target: NotificationTarget | null | undefined,
) {
  if (!target) {
    return null
  }

  if (target.kind === 'profile' && target.username) {
    return {
      params: { username: target.username },
      search: { tab: 'projects' as const },
      to: '/u/$username' as const,
    }
  }

  if (target.kind === 'project') {
    const [fallbackOwner, fallbackRepo] =
      target.projectFullName?.split('/') ?? []
    const owner = target.projectOwner ?? fallbackOwner
    const repo = target.projectRepo ?? fallbackRepo
    if (!owner || !repo) {
      return null
    }

    return {
      params: { owner, repo },
      search: target.commentId
        ? { comment: String(target.commentId) }
        : { comment: null },
      to: '/project/$owner/$repo' as const,
    }
  }

  if (target.kind === 'conversation' && target.conversationId) {
    return {
      search: getConversationInboxSearch(
        String(target.conversationId),
        target.inboxTab,
      ),
      to: '/inbox' as const,
    }
  }

  return null
}
