import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { Id } from '../../../convex/_generated/dataModel'

import { api } from '../../../convex/_generated/api'
import { convexClient } from '@/integrations/convex/client'
import { reportActionError } from '@/lib/action-error'
import {
  getInboxComposeSearch,
  getInboxDestinationSearch,
  getInboxTabForConversation,
} from './navigation'

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
            getInboxTabForConversation(conversation, otherUserKey),
          ),
        })
        return
      }

      await navigate({
        to: '/inbox',
        search: getInboxComposeSearch(otherUserKey),
      })
    } catch (error) {
      // Opening is a read plus navigation, so retrying is always safe.
      reportActionError(error, {
        title: "couldn't open the conversation",
        retry: () => openConversation(otherUserId),
      })
    } finally {
      setPendingUserId((current) => (current === otherUserKey ? null : current))
    }
  }

  return {
    openConversation,
    pendingUserId,
  }
}
