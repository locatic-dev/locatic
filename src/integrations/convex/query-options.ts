import { convexQuery } from '@convex-dev/react-query'
import type { PaginationOptions } from 'convex/server'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import type { ExploreScope } from '@/features/explore/state'

export const viewerQueryOptions = () =>
  convexQuery(api.users.viewerBootstrap, {})

export const privateProfileQueryOptions = () =>
  convexQuery(api.users.privateProfile, {})

export const privateProfileOverviewQueryOptions = () =>
  convexQuery(api.users.privateProfileOverview, {})

export const privateProfileProjectsQueryOptions = () =>
  convexQuery(api.users.privateProfileProjects, {})

export const privateProfileContributionsQueryOptions = () =>
  convexQuery(api.users.privateProfileContributions, {})

export const privateProfileCommentsQueryOptions = () =>
  convexQuery(api.users.privateProfileComments, {})

export const privateProfileLikedProjectsQueryOptions = () =>
  convexQuery(api.users.privateProfileLikedProjects, {})

export const viewerSummaryQueryOptions = () =>
  convexQuery(api.users.viewerSummary, {})

export const viewerLikedProjectIdsQueryOptions = () =>
  convexQuery(api.users.viewerLikedProjectIds, {})

export const viewerExplorePrefsQueryOptions = () =>
  convexQuery(api.users.viewerExplorePrefs, {})

export const viewerInboxSummaryQueryOptions = () =>
  convexQuery(api.users.viewerInboxSummary, {})

export const publicProfileQueryOptions = (username: string) =>
  convexQuery(api.users.publicProfile, { username })

export const publicProfileOverviewQueryOptions = (username: string) =>
  convexQuery(api.users.publicProfileOverview, { username })

export const publicProfileProjectsQueryOptions = (username: string) =>
  convexQuery(api.users.publicProfileProjects, { username })

export const publicProfileContributionsQueryOptions = (username: string) =>
  convexQuery(api.users.publicProfileContributions, { username })

export const publicProfileCommentsQueryOptions = (username: string) =>
  convexQuery(api.users.publicProfileComments, { username })

export const publicProfileLikedProjectsQueryOptions = (username: string) =>
  convexQuery(api.users.publicProfileLikedProjects, { username })

export const privateFollowGraphQueryOptions = ({
  kind,
  paginationOpts,
}: {
  kind: 'followers' | 'following'
  paginationOpts: PaginationOptions
}) =>
  convexQuery(api.users.privateFollowGraphPage, {
    kind,
    paginationOpts,
  })

export const publicFollowGraphQueryOptions = ({
  username,
  kind,
  paginationOpts,
}: {
  username: string
  kind: 'followers' | 'following'
  paginationOpts: PaginationOptions
}) =>
  convexQuery(api.users.publicFollowGraphPage, {
    username,
    kind,
    paginationOpts,
  })

export const homeFeedQueryOptions = (cursor?: number, limit = 20) =>
  convexQuery(api.home.list, { cursor, limit })

export const exploreFeedQueryOptions = ({
  limit = 20,
  scope = 'default',
  selectedCityIds = [],
}: {
  limit?: number
  scope?: ExploreScope
  selectedCityIds?: Array<Id<'cities'>>
} = {}) =>
  convexQuery(api.explore.list, {
    limit,
    scope,
    selectedCityIds,
  })

export const nearbyBuildersQueryOptions = (cityIds: Array<Id<'cities'>> = []) =>
  convexQuery(api.explore.listNearbyBuilders, { cityIds })

export const builderSearchQueryOptions = (q: string) =>
  convexQuery(api.explore.searchBuilders, { q })

export const citiesSearchQueryOptions = (query: string, limit = 10) =>
  convexQuery(api.cities.search, { query, limit })

export const popularCitiesQueryOptions = () =>
  convexQuery(api.cities.listPopular, {})

export const citiesByIdsQueryOptions = (cityIds: Array<any>) =>
  convexQuery(api.cities.listByIds, { cityIds })

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

export const mineProjectsQueryOptions = () =>
  convexQuery(api.projects.listMine, {})

export const notificationsQueryOptions = () =>
  convexQuery(api.notifications.list, {})

export const notificationsUnreadCountQueryOptions = () =>
  convexQuery(api.notifications.unreadCount, {})

export const conversationsQueryOptions = () =>
  convexQuery(api.conversations.list, {})

export const conversationDetailQueryOptions = (
  conversationId: Id<'conversations'>,
) => convexQuery(api.conversations.get, { conversationId })

export const followingQueryOptions = (userId: Id<'users'>) =>
  convexQuery(api.follows.listFollowing, { userId })
