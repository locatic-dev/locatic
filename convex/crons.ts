import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'

const crons = cronJobs()

crons.interval(
  'seed default cities once per day',
  { hours: 24 },
  internal.cities.seedDefaultCities,
  {},
)
crons.interval(
  'seed default reactions once per day',
  { hours: 24 },
  internal.reactions.seedDefaultReactions,
  {},
)
crons.interval(
  'rebuild pulse snapshots hourly',
  { hours: 1 },
  internal.pulse.rebuildSnapshots,
  {},
)
crons.interval(
  'refresh active project metadata hourly',
  { hours: 1 },
  internal.github_actions.refreshActiveProjectMetadata,
  {},
)
crons.interval(
  'refresh project contributors every six hours',
  { hours: 6 },
  internal.github_actions.refreshDueProjectContributors,
  { limit: 20 },
)
crons.interval(
  'cleanup feed and notification history daily',
  { hours: 24 },
  internal.cleanup.runDailyCleanup,
  {},
)

export default crons
