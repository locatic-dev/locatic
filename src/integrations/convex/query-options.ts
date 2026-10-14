import { convexQuery } from '@convex-dev/react-query'
import type { PaginationOptions } from 'convex/server'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { emailClientRefs } from './email-function-refs'

export const viewerQueryOptions = () =>
  convexQuery(api.users.viewerBootstrap, {})

export const emailCampaignListQueryOptions = () =>
  convexQuery(emailClientRefs.campaigns.list, {})

export const emailCampaignQueryOptions = (
  campaignId: Id<'email_campaigns'> | null,
) =>
  convexQuery(
    emailClientRefs.campaigns.get,
    campaignId ? { campaignId } : 'skip',
  )

export const emailCampaignProjectSearchQueryOptions = (query: string) =>
  convexQuery(
    emailClientRefs.campaigns.searchProjects,
    query.trim() ? { query } : 'skip',
  )

export const privateProfileQueryOptions = () =>
  convexQuery(api.users.privateProfile, {})

export const privateProfileOverviewQueryOptions = () =>
  convexQuery(api.users.privateProfileOverview, {})

export const privateProfileProjectsQueryOptions = () =>
  convexQuery(api.users.privateProfileProjects, {})

export const privateProfilePostsQueryOptions = () =>
  convexQuery(api.users.privateProfilePosts, {})

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

export const publicProfileQueryOptions = (username: string) =>
  convexQuery(api.users.publicProfile, { username })

export const publicProfileOverviewQueryOptions = (username: string) =>
  convexQuery(api.users.publicProfileOverview, { username })

export const publicProfileProjectsQueryOptions = (username: string) =>
  convexQuery(api.users.publicProfileProjects, { username })

export const publicProfilePostsQueryOptions = (username: string) =>
  convexQuery(api.users.publicProfilePosts, { username })

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

export const homeFeedQueryOptions = (
  paginationOpts: PaginationOptions = {
    cursor: null,
    numItems: 20,
  },
) => convexQuery(api.home.list, { paginationOpts })

// Convex subscribes to every query key in the cache, even a disabled one, so
// an inactive query passes 'skip' instead of placeholder args: an empty
// search, an empty id list or a missing id reads nothing.

export const builderSearchQueryOptions = ({
  cityIds = [],
  limit = 20,
  openToCollab,
  q,
}: {
  cityIds?: Array<Id<'cities'>>
  limit?: number
  openToCollab?: boolean
  q: string
}) =>
  convexQuery(
    api.explore.searchBuilders,
    q.trim()
      ? {
          cityIds,
          limit,
          ...(openToCollab ? { openToCollab: true } : {}),
          q,
        }
      : 'skip',
  )

export const projectSearchQueryOptions = ({
  cityIds = [],
  language,
  limit = 10,
  q,
  topic,
}: {
  cityIds?: Array<Id<'cities'>>
  language?: string
  limit?: number
  q: string
  topic?: string
}) =>
  convexQuery(
    api.explore.searchProjects,
    q.trim()
      ? {
          cityIds,
          ...(language ? { language } : {}),
          limit,
          q,
          ...(topic ? { topic } : {}),
        }
      : 'skip',
  )

export const postSearchQueryOptions = ({
  cityIds = [],
  limit = 10,
  q,
}: {
  cityIds?: Array<Id<'cities'>>
  limit?: number
  q: string
}) =>
  convexQuery(
    api.explore.searchPosts,
    q.trim() ? { cityIds, limit, q } : 'skip',
  )

// CityCombobox shows at most 8 rows, so read no more than it can render.
export const citiesSearchQueryOptions = (query: string, limit = 8) =>
  convexQuery(api.cities.search, query.trim() ? { query, limit } : 'skip')

export const popularCitiesQueryOptions = () =>
  convexQuery(api.cities.listPopular, {})

export const citiesByIdsQueryOptions = (cityIds: Array<any>) =>
  convexQuery(api.cities.listByIds, cityIds.length > 0 ? { cityIds } : 'skip')

/**
 * Nearby active cities for the Explore rail; a public query. Skipped (no
 * subscription) without a single city.
 */
export const nearbyCitiesQueryOptions = (cityId: Id<'cities'> | null) =>
  convexQuery(api.cities.listNearby, cityId ? { cityId } : 'skip')

/** Landing map (plan item D7): active cities with builders, public. */
export const landingMapCitiesQueryOptions = () =>
  convexQuery(api.cities.listActiveForMap, {})

/**
 * Landing activity (plan item D7): recent posts, releases and projects on
 * their owners' cities, public.
 */
export const landingActivityQueryOptions = () =>
  convexQuery(api.landing.listRecentActivity, {})

export const projectDetailQueryOptions = ({
  owner,
  repo,
}: {
  owner: string
  repo: string
}) => convexQuery(api.projects.getPublicByRoute, { owner, repo })

export const mineProjectsQueryOptions = () =>
  convexQuery(api.projects.listMine, {})

export const notificationsQueryOptions = (
  paginationOpts: PaginationOptions = {
    cursor: null,
    numItems: 20,
  },
) => convexQuery(api.notifications.list, { paginationOpts })

export const notificationsUnreadCountQueryOptions = (ready = true) =>
  convexQuery(api.notifications.unreadCount, ready ? {} : 'skip')

export const conversationsQueryOptions = () =>
  convexQuery(api.conversations.list, {})

export const conversationDetailQueryOptions = (
  conversationId: Id<'conversations'>,
) => convexQuery(api.conversations.get, { conversationId })

export const conversationRecipientPreviewQueryOptions = (
  otherUserId: string | null,
) =>
  convexQuery(
    api.conversations.getRecipientPreview,
    otherUserId ? { otherUserId } : 'skip',
  )

export const followingQueryOptions = (userId: Id<'users'>) =>
  convexQuery(api.follows.listFollowing, { userId })
