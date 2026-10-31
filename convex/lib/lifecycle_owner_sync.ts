import { internal } from '../_generated/api'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { shouldPurgeDeletedAccount } from './account_deletion'
import { createCityStatsChanges, getBuilderCityId } from './cityStats'
import {
  buildActorSnapshot,
  buildOwnerSnapshot,
  buildProjectExploreOwner,
  getPostCityId,
} from './snapshots'

type Progress = { generation: number; stage: number; cursor: string | null }
export type LifecycleOwnerSyncArgs = Progress & { userId: Id<'users'> }
const PAGE_SIZE = 25

/**
 * Profile/privacy/lifecycle authority commits immediately; copies catch up in
 * pages. Retain the original field/job names so queued lifecycle jobs remain
 * compatible. Any new owner-state change supersedes the prior generation.
 */
export async function startLifecycleOwnerSync(
  ctx: MutationCtx,
  previous: Doc<'users'>,
  user: Doc<'users'>,
): Promise<void> {
  if (
    user.purgedAt != null ||
    user.purgeProgress != null ||
    shouldPurgeDeletedAccount(user, Date.now())
  )
    return
  const cityStats = createCityStatsChanges()
  cityStats.moveBuilder(getBuilderCityId(previous), getBuilderCityId(user))
  await cityStats.apply(ctx.db)
  const progress = {
    generation: (previous.lifecycleOwnerSync?.generation ?? 0) + 1,
    stage: 0,
    cursor: null,
  }
  await ctx.db.patch(user._id, { lifecycleOwnerSync: progress })
  await ctx.scheduler.runAfter(0, internal.users.syncLifecycleOwnerStatePage, {
    userId: user._id,
    ...progress,
  })
}

export async function syncLifecycleOwnerStatePage(
  ctx: MutationCtx,
  args: LifecycleOwnerSyncArgs,
): Promise<void> {
  const user = await ctx.db.get(args.userId)
  const progress = user?.lifecycleOwnerSync
  if (
    !user ||
    !progress ||
    user.purgedAt != null ||
    user.purgeProgress != null ||
    shouldPurgeDeletedAccount(user, Date.now()) ||
    progress.generation !== args.generation ||
    progress.stage !== args.stage ||
    progress.cursor !== args.cursor ||
    progress.stage >= 3
  )
    return
  const options = {
    cursor: progress.cursor,
    numItems: PAGE_SIZE,
    maximumRowsRead: PAGE_SIZE,
    maximumBytesRead: 256_000,
  }
  let next: { isDone: boolean; continueCursor: string }
  if (progress.stage === 0) {
    const page = await ctx.db
      .query('projects')
      .withIndex('by_owner', (q) => q.eq('ownerId', user._id))
      .paginate(options)
    const ownerSnapshot = await buildOwnerSnapshot(ctx.db, user)
    const cityStats = createCityStatsChanges()
    for (const project of page.page) {
      const exploreOwner = buildProjectExploreOwner(
        user,
        project.locatic.isVisible,
      )
      await cityStats.moveProject(ctx.db, project, project, { exploreOwner })
      await ctx.db.patch(project._id, { ownerSnapshot, exploreOwner })
    }
    await cityStats.apply(ctx.db)
    next = page
  } else if (progress.stage === 1) {
    const page = await ctx.db
      .query('posts')
      .withIndex('by_owner_deleted_created', (q) => q.eq('ownerId', user._id))
      .paginate(options)
    const projectCityId = getPostCityId(user)
    for (const post of page.page)
      if (post.projectCityId !== projectCityId)
        await ctx.db.patch(post._id, { projectCityId })
    next = page
  } else {
    const page = await ctx.db
      .query('posts')
      .withIndex('by_actor_deleted_created', (q) =>
        q.eq('actorId', user._id).eq('deletedAt', null),
      )
      .paginate(options)
    const actorSnapshot = await buildActorSnapshot(ctx.db, user)
    for (const post of page.page)
      await ctx.db.patch(post._id, { actorSnapshot })
    next = page
  }
  const nextProgress: Progress = {
    generation: progress.generation,
    stage: progress.stage + (next.isDone ? 1 : 0),
    cursor: next.isDone ? null : next.continueCursor,
  }
  await ctx.db.patch(user._id, { lifecycleOwnerSync: nextProgress })
  if (nextProgress.stage < 3)
    await ctx.scheduler.runAfter(
      0,
      internal.users.syncLifecycleOwnerStatePage,
      { userId: user._id, ...nextProgress },
    )
}
