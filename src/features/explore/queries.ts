import { convexQuery } from '@convex-dev/react-query'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

export {
  builderSearchQueryOptions,
  nearbyCitiesQueryOptions,
  projectSearchQueryOptions,
  postSearchQueryOptions,
} from '@/integrations/convex/query-options'

/**
 * Maintained counters for one city (plan item A4); a public query. Skipped
 * (no subscription) without a city.
 */
export const cityStatsQueryOptions = (cityId: Id<'cities'> | null) =>
  convexQuery(api.cities.getStats, cityId ? { cityId } : 'skip')
