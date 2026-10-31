import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import type { ProjectCardPreview } from '@/features/contracts'

/**
 * A builder row as Explore returns it: public identity (location disclosed
 * per the visibility policy, `location.kind`) plus discovery counts.
 */
export type BuilderPreview = FunctionReturnType<
  typeof api.explore.searchBuilders
>[number]

/**
 * An Explore project row. `isViewerProject` is set only on the signed-in
 * feed: the viewer's own projects, listed last in an explicitly selected
 * city and marked "yours".
 */
export type ExploreProjectPreview = ProjectCardPreview & {
  isViewerProject?: boolean
}

/**
 * An Explore post row: the reviewed public fields (`listPostsPublic`), plus
 * viewer reaction state on signed-in feeds.
 */
export type ExplorePostPreview = FunctionReturnType<
  typeof api.explore.listPostsPublic
>['page'][number] & {
  searchText?: string
  deletedAt?: number | null
  viewerHasLiked?: boolean
  viewerReactionTypes?: string[]
}

export type ExploreCityChip = {
  id: string
  /** Full label for the chip ("Bengaluru, Karnataka, India"). */
  name: string
  /** City name alone for status copy; null until the city doc loads. */
  shortName: string | null
}

export type ExploreCityDoc = Doc<'cities'>
