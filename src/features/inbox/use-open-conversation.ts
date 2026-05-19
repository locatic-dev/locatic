import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'

import { api } from '../../../convex/_generated/api'
import { convexClient } from '@/integrations/convex/client'
import { getInboxDestinationSearch } from './navigation'

export function useOpenConversation() {
  const navigate = useNavigate()
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)

  const openConversation = async (otherUserId: string) => {
    if (!otherUserId || pendingUserId === otherUserId) {
      return
    }

    setPendingUserId(otherUserId)

    try {
      const conversation = await convexClient.mutation(
        api.conversations.startOrGet,
        {
          otherUserId: otherUserId as never,
        },
      )
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
    } catch (error) {
      console.error('Conversation open failed', error)
      toast.error('Could not open the conversation. Please try again.')
    } finally {
      setPendingUserId((current) => (current === otherUserId ? null : current))
    }
  }

  return {
    openConversation,
    pendingUserId,
  }
}
