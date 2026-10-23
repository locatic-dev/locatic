import type { EnrichedConversation } from '@/features/contracts'

export type InboxTab = 'inbox' | 'requests'

export type InboxSearch = {
  tab: InboxTab
  conversation: string | null
  compose: string | null
}
export const INBOX_SEARCH_DEFAULTS = {
  tab: 'inbox',
  conversation: null,
  compose: null,
} as const

export function normalizeInboxSearch(
  search: Record<string, unknown>,
): InboxSearch {
  const optionalId = (value: unknown) => {
    const id = typeof value === 'string' ? value.trim() : ''
    return id && id !== 'null' && id !== 'undefined' ? id : null
  }
  const conversation = optionalId(search.conversation)
  return {
    tab: search.tab === 'requests' ? 'requests' : 'inbox',
    conversation,
    compose: conversation ? null : optionalId(search.compose),
  }
}

/**
 * How a conversation reads for the viewer, as `conversations.listPage` and
 * `conversations.getSummary` return it: `request` is an incoming message request,
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
