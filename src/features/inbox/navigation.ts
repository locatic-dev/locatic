export type InboxTab = 'inbox' | 'requests'

export function getInboxTabForConversation(isRequest: boolean): InboxTab {
  return isRequest ? 'requests' : 'inbox'
}

export function getInboxDestinationSearch(
  conversationId: string,
  isRequest: boolean,
) {
  return {
    conversation: conversationId,
    tab: getInboxTabForConversation(isRequest),
  }
}
