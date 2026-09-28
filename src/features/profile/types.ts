import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'

/**
 * The profile page payload as `users.publicProfileOverview` returns it:
 * public identity (location disclosed per the visibility policy), public tab
 * settings and counts, pinned projects and recent work. Both profile routes
 * render their pinned and recent sections from it.
 */
export type PublicProfileOverview = NonNullable<
  FunctionReturnType<typeof api.users.publicProfileOverview>
>

export type ProfileLocation = PublicProfileOverview['profile']['location']

export type ProfileShowcaseProject =
  PublicProfileOverview['pinnedProjects'][number]

/** One row of the profile shipping log (`users.publicProfileShippingLog`). */
export type ProfileShippingLogEntry = NonNullable<
  FunctionReturnType<typeof api.users.publicProfileShippingLog>
>[number]
