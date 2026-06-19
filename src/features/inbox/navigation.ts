export type InboxTab = 'inbox' | 'requests'

export function getInboxTabForConversation(isRequest: boolean): InboxTab {
  return isRequest ? 'requests' : 'inbox'
}

export function getInboxDestinationSearch(
  conversationId: string,
  isRequest: boolean,
) {
  return {
    compose: null,
    conversation: conversationId,
    tab: getInboxTabForConversation(isRequest),
  }
}

export function getInboxComposeSearch(otherUserId: string) {
  return {
    compose: otherUserId,
    conversation: null,
    tab: 'inbox' as const,
  }
}
