import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'

// Both run only from an explicit user action (a row click, "mark all read").
// Viewing the notifications list never writes.
export const useMarkNotificationRead = () =>
  useMutation(api.notifications.markRead)
export const useMarkAllNotificationsRead = () =>
  useMutation(api.notifications.markAllRead)
