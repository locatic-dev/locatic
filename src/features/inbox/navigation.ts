import type { EnrichedConversation } from '@/features/contracts'

export type InboxTab = 'inbox' | 'requests'

/**
 * How a conversation reads for the viewer, as `conversations.list` and
 * `conversations.get` return it: `request` is an incoming message request,
 * `pending` an outgoing one the other person has not answered, `active` an
 * accepted conversation.
 */
export type ConversationStatus = EnrichedConversation['status']

export type InboxConversation = EnrichedConversation

/**
 * "requests" holds incoming requests only. Outgoing requests stay in the
 * main inbox list with a pending label.
 */
export function getInboxTabForStatus(status: ConversationStatus): InboxTab {
  return status === 'request' ? 'requests' : 'inbox'
}

/**
 * Tab for a raw conversation document opened with `otherUserId`. The same
 * rule as the server's `status`: while `isRequest` holds, the last message
 * came from whoever started the conversation, so it is incoming only when the
 * other person sent it.
 */
export function getInboxTabForConversation(
  conversation: { isRequest: boolean; lastMessage: { senderId: string } },
  otherUserId: string,
): InboxTab {
  return conversation.isRequest &&
    String(conversation.lastMessage.senderId) === otherUserId
    ? 'requests'
    : 'inbox'
}

export function getInboxDestinationSearch(
  conversationId: string,
  tab: InboxTab,
) {
  return {
    compose: null,
    conversation: conversationId,
    tab,
  }
}

export function getInboxComposeSearch(otherUserId: string) {
  return {
    compose: otherUserId,
    conversation: null,
    tab: 'inbox' as const,
  }
}
