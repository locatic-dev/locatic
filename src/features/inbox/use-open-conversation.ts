import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import type { Id } from '../../../convex/_generated/dataModel'

import { api } from '../../../convex/_generated/api'
import { convexClient } from '@/integrations/convex/client'
import { getInboxComposeSearch, getInboxDestinationSearch } from './navigation'

export function useOpenConversation() {
  const navigate = useNavigate()
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)

  const openConversation = async (otherUserId: Id<'users'>) => {
    const otherUserKey = String(otherUserId)
    if (!otherUserId || pendingUserId === otherUserKey) {
      return
    }

    setPendingUserId(otherUserKey)

    try {
      const conversation = await convexClient.query(
        api.conversations.findWithUser,
        {
          otherUserId,
        },
      )

      if (conversation) {
        await navigate({
          to: '/inbox',
          search: getInboxDestinationSearch(
            String(conversation._id),
            conversation.isRequest,
          ),
        })
        return
      }

      await navigate({
        to: '/inbox',
        search: getInboxComposeSearch(otherUserKey),
      })
    } catch (error) {
      console.error('Conversation open failed', error)
      toast.error('Could not open the conversation. Please try again.')
    } finally {
      setPendingUserId((current) => (current === otherUserKey ? null : current))
    }
  }

  return {
    openConversation,
    pendingUserId,
  }
}
