import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'

export const useSendMessage = () => useMutation(api.conversations.sendMessage)
export const useMarkConversationRead = () =>
  useMutation(api.conversations.markRead)
