import { ConvexError } from 'convex/values'

import type { MutationCtx } from '../_generated/server'
import { enqueueActivityEventFanOut } from './homeFeed'
import {
  buildProjectNotificationTarget,
  createNotificationIfEnabled,
} from './notifications'
import { resolveProjectOwnerLogin } from './project_route'
import { getNextProjectReactionLocatic } from './reactions'
import { buildActorSnapshot, buildProjectSnapshot } from './snapshots'
import type { Doc } from './types'

type ProjectReactionArgs = {
  now: number
  project: Doc<'projects'>
  reactionType: string
  viewer: Doc<'users'>
}

async function restoreLikedProjectToExplore(
  ctx: MutationCtx,
  viewerId: Doc<'users'>['_id'],
  projectId: Doc<'projects'>['_id'],
  now: number,
) {
  const history = await ctx.db
    .query('explore_history')
    .withIndex('by_user_project', (query) =>
      query.eq('userId', viewerId).eq('projectId', projectId),
    )
    .unique()

  if (history) {
    await ctx.db.patch(history._id, {
      likedAt: now,
      lastSeenAt: now,
      dismissedAt: null,
    })
  }
}

export async function addProjectReaction(
  ctx: MutationCtx,
  { now, project, reactionType, viewer }: ProjectReactionArgs,
) {
  const targetId = String(project._id)
  const existing = await ctx.db
    .query('reactions')
    .withIndex('by_user_target_type_id_reaction', (query) =>
      query
        .eq('userId', viewer._id)
        .eq('targetType', 'project')
        .eq('targetId', targetId)
        .eq('reactionType', reactionType),
    )
    .unique()

  if (existing) {
    return { created: false, reaction: existing }
  }

  const reactionId = await ctx.db.insert('reactions', {
    userId: viewer._id,
    targetType: 'project',
    targetId,
    reactionType,
    createdAt: now,
  })
  const reaction = await ctx.db.get(reactionId)
  if (!reaction) {
    throw new ConvexError('Reaction could not be created')
  }

  const nextLocatic = getNextProjectReactionLocatic(project, reactionType, 1)
  await ctx.db.patch(project._id, {
    locatic: nextLocatic,
    updatedAt: now,
  })

  if (reactionType !== 'like') {
    return { created: true, reaction }
  }

  await ctx.db.patch(viewer._id, {
    stats: {
      ...viewer.stats,
      likedCount: viewer.stats.likedCount + 1,
    },
    updatedAt: now,
  })

  const projectSnapshot = buildProjectSnapshot({
    ...project,
    locatic: nextLocatic,
    updatedAt: now,
  })
  const eventId = await ctx.db.insert('activity_events', {
    actorId: viewer._id,
    eventType: 'project_liked',
    projectId: project._id,
    commentId: null,
    actorSnapshot: await buildActorSnapshot(ctx.db, viewer),
    projectSnapshot,
    target: {
      kind: 'project',
      projectId: project._id,
      projectSnapshot,
    },
    createdAt: now,
  })

  await enqueueActivityEventFanOut(ctx, eventId)

  const owner = await ctx.db.get(project.ownerId)
  if (owner) {
    await createNotificationIfEnabled(ctx, {
      recipient: owner,
      actor: viewer,
      type: 'project_liked',
      projectId: project._id,
      projectName: project.github.name,
      target: buildProjectNotificationTarget({
        fullName: project.github.fullName,
        owner: resolveProjectOwnerLogin(project),
        repo: project.github.name,
      }),
      createdAt: now,
    })
  }

  await restoreLikedProjectToExplore(ctx, viewer._id, project._id, now)

  return { created: true, reaction }
}

export async function removeProjectReaction(
  ctx: MutationCtx,
  { now, project, reactionType, viewer }: ProjectReactionArgs,
) {
  const existing = await ctx.db
    .query('reactions')
    .withIndex('by_user_target_type_id_reaction', (query) =>
      query
        .eq('userId', viewer._id)
        .eq('targetType', 'project')
        .eq('targetId', String(project._id))
        .eq('reactionType', reactionType),
    )
    .unique()

  if (!existing) {
    return false
  }

  await ctx.db.delete(existing._id)
  const nextLocatic = getNextProjectReactionLocatic(project, reactionType, -1)
  await ctx.db.patch(project._id, {
    locatic: nextLocatic,
    updatedAt: now,
  })

  if (reactionType === 'like') {
    await ctx.db.patch(viewer._id, {
      stats: {
        ...viewer.stats,
        likedCount: Math.max(0, viewer.stats.likedCount - 1),
      },
      updatedAt: now,
    })
  }

  return true
}
