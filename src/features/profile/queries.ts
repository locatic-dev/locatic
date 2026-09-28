import { convexQuery } from '@convex-dev/react-query'

import { api } from '../../../convex/_generated/api'

export {
  privateProfileCommentsQueryOptions,
  privateProfileContributionsQueryOptions,
  privateProfileLikedProjectsQueryOptions,
  privateProfileOverviewQueryOptions,
  privateProfilePostsQueryOptions,
  privateProfileProjectsQueryOptions,
  privateFollowGraphQueryOptions,
  publicProfileQueryOptions,
  publicProfileCommentsQueryOptions,
  publicProfileContributionsQueryOptions,
  publicProfileLikedProjectsQueryOptions,
  publicProfileOverviewQueryOptions,
  publicProfilePostsQueryOptions,
  publicProfileProjectsQueryOptions,
  privateProfileQueryOptions,
  publicFollowGraphQueryOptions,
} from '@/integrations/convex/query-options'

// Read only by the two profile routes (plan item D6).
export const publicProfileShippingLogQueryOptions = (username: string) =>
  convexQuery(api.users.publicProfileShippingLog, { username })
