import { convexQuery } from '@convex-dev/react-query'

import { api } from '../../../convex/_generated/api'

export const viewerQueryOptions = () =>
  convexQuery(api.users.viewerBootstrap, {})

export const privateProfileQueryOptions = () =>
  convexQuery(api.users.privateProfile, {})

export const publicProfileQueryOptions = (username: string) =>
  convexQuery(api.users.publicProfile, { username })

export const homeFeedQueryOptions = (cursor?: number, limit = 20) =>
  convexQuery(api.home.list, { cursor, limit })

export const exploreFeedQueryOptions = (limit = 20) =>
  convexQuery(api.explore.list, { limit })

export const pulseQueryOptions = ({
  scopeType,
  scopeId,
  timeWindow,
  sort,
  page = 1,
}: {
  scopeType: 'city' | 'global'
  scopeId: string | null
  timeWindow: 'day' | 'week' | 'month'
  sort: 'locatic_likes' | 'comments' | 'github_stars'
  page?: number
}) =>
  convexQuery(api.pulse.listPublic, {
    scopeType,
    scopeId,
    timeWindow,
    sort,
    page,
  })

export const projectDetailQueryOptions = (fullName: string) =>
  convexQuery(api.projects.getPublicByFullName, { fullName })

export const notificationsQueryOptions = () =>
  convexQuery(api.notifications.list, {})

export const conversationsQueryOptions = () =>
  convexQuery(api.conversations.list, {})
