import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'

export const useMarkNotificationRead = () =>
  useMutation(api.notifications.markRead)
export const useMarkAllNotificationsRead = () =>
  useMutation(api.notifications.markAllRead)
export const useBackfillNotificationTargets = () =>
  useMutation(api.notifications.backfillTargets)
