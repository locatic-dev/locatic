import { convexQuery } from '@convex-dev/react-query'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

export { homeFeedQueryOptions } from '@/integrations/convex/query-options'

export type HomeNearbyBuilder = FunctionReturnType<
  typeof api.users.suggestOnboardingBuilders
>[number]

/**
 * "Builders near you" for a member who follows no one: exact-city members of
 * the viewer's city, a bounded list (the onboarding suggestion query).
 * Skipped without a city.
 */
export const homeNearbyBuildersQueryOptions = (cityId: Id<'cities'> | null) =>
  convexQuery(api.users.suggestOnboardingBuilders, cityId ? { cityId } : 'skip')
