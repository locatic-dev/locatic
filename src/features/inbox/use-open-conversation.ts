import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'

import { useStartOrGetConversation } from './mutations'
import { getInboxDestinationSearch } from './navigation'

export function useOpenConversation() {
  const navigate = useNavigate()
  const startOrGetConversation = useStartOrGetConversation()
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)

  const openConversation = async (otherUserId: string) => {
    if (!otherUserId || pendingUserId === otherUserId) {
      return
    }

    setPendingUserId(otherUserId)

    try {
      const conversation = await startOrGetConversation({
        otherUserId: otherUserId as never,
      })
      if (!conversation) {
        throw new Error('Conversation could not be opened')
      }

      await navigate({
        to: '/inbox',
        search: getInboxDestinationSearch(
          String(conversation._id),
          conversation.isRequest,
        ) as never,
      } as never)
    } finally {
      setPendingUserId((current) => (current === otherUserId ? null : current))
    }
  }

  return {
    openConversation,
    pendingUserId,
  }
}
