import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'
import { emailRefs } from './lib/email_function_refs'

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
  'refresh active project metadata hourly',
  { hours: 1 },
  internal.github_actions.refreshActiveProjectMetadata,
  { limit: 25 },
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
crons.interval(
  'prepare due community email draft daily',
  { hours: 24 },
  emailRefs.digest.prepareDue,
  {},
)
crons.interval(
  'recover community email contact synchronization',
  { minutes: 5 },
  emailRefs.delivery.reconcileContacts,
  { limit: 10 },
)
crons.interval(
  'recover community email contact cleanup',
  { minutes: 5 },
  emailRefs.delivery.reconcileContactCleanups,
  { limit: 10 },
)
crons.interval(
  'recover community email deliveries',
  { minutes: 5 },
  emailRefs.delivery.recoverDeliveries,
  { limit: 10 },
)

export default crons
