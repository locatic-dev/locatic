import { convexQuery } from '@convex-dev/react-query'

import { api } from '../../../convex/_generated/api'

/** The public city page; `slug` may also be a city id. */
export const cityPageQueryOptions = (slug: string) =>
  convexQuery(api.cities.getPage, { slug })
