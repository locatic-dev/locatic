import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import type { Doc } from './types'

/**
 * Returns a scheduled campaign to an editable draft. Undo and Stop sending
 * also cancel its pending job; the job itself, failing a start check, does
 * not (it is the running function). The job also ignores a schedule that is
 * not its own, so a cancel that loses the race is harmless.
 */
export async function returnToDraft(
  ctx: MutationCtx,
  campaign: Doc<'email_campaigns'>,
  updatedBy: Id<'users'>,
  {
    cancelJob = true,
    diagnostic,
  }: { cancelJob?: boolean; diagnostic?: string } = {},
) {
  if (cancelJob && campaign.scheduled) {
    await ctx.scheduler.cancel(campaign.scheduled.jobId)
  }
  await ctx.db.patch(campaign._id, {
    state: 'draft',
    scheduled: undefined,
    preparationDiagnostics: diagnostic ? [diagnostic] : [],
    updatedBy,
    updatedAt: Date.now(),
  })
}
