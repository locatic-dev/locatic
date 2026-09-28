import { convexQuery } from '@convex-dev/react-query'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

export type OnboardingBuilderSuggestion = FunctionReturnType<
  typeof api.users.suggestOnboardingBuilders
>[number]

/** Builders for the optional follow step; skipped until a city is chosen. */
export const onboardingBuilderSuggestionsQueryOptions = (
  cityId: Id<'cities'> | null,
) =>
  convexQuery(api.users.suggestOnboardingBuilders, cityId ? { cityId } : 'skip')
