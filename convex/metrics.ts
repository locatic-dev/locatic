import { makeFunctionReference } from 'convex/server'
import { v, type Infer } from 'convex/values'

import {
  internalMutation,
  mutation,
  type MutationCtx,
} from './_generated/server'

/**
 * Daily product counters (plan item E4, T7). Each counted action adds 1 to a
 * `metrics_daily` row keyed by UTC day and metric key. Nothing identifies the
 * user, and page views are never counted. docs/metrics.md lists what each key
 * means and how to read it next to the dashboard's function breakdown.
 */

/** Counted inside the mutation that performs the action. */
const serverMetricKey = v.union(
  v.literal('follow'),
  v.literal('save'),
  v.literal('comment'),
  v.literal('dm_open'),
)

/** Counted from the client, for actions that have no mutation of their own. */
const clientMetricKey = v.union(
  v.literal('empty_state_action'),
  v.literal('discovery_sign_in_return'),
)

const metricKey = v.union(serverMetricKey, clientMetricKey)

export type ServerMetricKey = Infer<typeof serverMetricKey>
export type ClientMetricKey = Infer<typeof clientMetricKey>
type MetricKey = Infer<typeof metricKey>

/** UTC calendar day, `YYYY-MM-DD`. */
export function metricDay(now: number) {
  return new Date(now).toISOString().slice(0, 10)
}

async function incrementDailyCount(ctx: MutationCtx, key: MetricKey) {
  const day = metricDay(Date.now())
  const row = await ctx.db
    .query('metrics_daily')
    .withIndex('by_day_key', (query) => query.eq('day', day).eq('key', key))
    .unique()

  if (row) {
    await ctx.db.patch(row._id, { count: row.count + 1 })
  } else {
    await ctx.db.insert('metrics_daily', { day, key, count: 1 })
  }
}

export const increment = internalMutation({
  args: { key: metricKey },
  returns: v.null(),
  handler: async (ctx, args) => {
    await incrementDailyCount(ctx, args.key)
    return null
  },
})

// `internal.metrics.increment` once `convex dev`/`codegen` has regenerated
// convex/_generated/api.d.ts with this module; the name is the same.
const incrementReference = makeFunctionReference<
  'mutation',
  { key: MetricKey },
  null
>('metrics:increment')

/**
 * Counts a successful action. Call it after the action's writes: the
 * increment is scheduled, so it commits only with the calling mutation and
 * runs in its own transaction, keeping the shared counter row out of the
 * caller's conflict set.
 */
export async function countMetric(ctx: MutationCtx, key: ServerMetricKey) {
  await ctx.scheduler.runAfter(0, incrementReference, { key })
}

/**
 * Client-reported counters (empty-state actions, returning to a discovery
 * page after sign-in). Signed-in callers only; anonymous calls are ignored so
 * the endpoint cannot be used to inflate counts without an account.
 */
export const record = mutation({
  args: { key: clientMetricKey },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return null
    }

    await incrementDailyCount(ctx, args.key)
    return null
  },
})
