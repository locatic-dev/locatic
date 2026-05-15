export function buildConversationKey(
  participantA: string,
  participantB: string,
): string {
  if (participantA === participantB) {
    throw new Error('Conversation participants must be different')
  }

  return [participantA, participantB].sort().join('::')
}
