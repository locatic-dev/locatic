import { convexQuery } from '@convex-dev/react-query'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

export {
  mineProjectsQueryOptions,
  projectDetailQueryOptions,
} from '@/integrations/convex/query-options'

/** Latest update, sync freshness and owner location for the project header. */
export const projectSignalsQueryOptions = (projectId: Id<'projects'>) =>
  convexQuery(api.projects.getProjectSignals, { projectId })

/** "More from {city}": set only when the owner discloses their exact city. */
export const moreFromOwnerCityQueryOptions = (projectId: Id<'projects'>) =>
  convexQuery(api.projects.listMoreFromOwnerCity, { projectId })
