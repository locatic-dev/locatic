import { ConvexError, v } from 'convex/values'

import { internalMutation, mutation, query } from './_generated/server'
import { fanOutActivityEventToFollowers } from './lib/homeFeed'
import { getViewerOrThrow } from './lib/auth'
import {
  buildActorSnapshot,
  buildProjectSnapshot,
  buildUpdateSnapshot,
} from './lib/snapshots'
import { resolveProjectOwnerLogin } from './lib/project_route'

export const listByProject = query({
  args: {
    projectId: v.id('projects'),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('updates')
      .withIndex('by_project', (query) => query.eq('projectId', args.projectId))
      .collect()
  },
})

export const create = mutation({
  args: {
    projectId: v.id('projects'),
    versionTag: v.union(v.string(), v.null()),
    title: v.union(v.string(), v.null()),
    description: v.string(),
    additionalDetail: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const project = await ctx.db.get(args.projectId)
    if (!project || project.ownerId !== viewer._id) {
      throw new ConvexError('Project not found')
    }

    const ownerSnapshot = await buildActorSnapshot(ctx.db, viewer)
    const updateId = await ctx.db.insert('updates', {
      projectId: project._id,
      ownerId: viewer._id,
      versionTag: args.versionTag,
      title: args.title,
      description: args.description,
      additionalDetail: args.additionalDetail,
      reactionCounts: {},
      commentsCount: 0,
      ownerSnapshot: {
        ...ownerSnapshot,
        buildStatus: viewer.profile.buildStatus,
      },
      projectSnapshot: {
        name: project.github.name,
        fullName: project.github.fullName,
        ownerLogin: resolveProjectOwnerLogin(project),
        primaryLanguage: project.github.primaryLanguage,
        languages: project.github.languages,
      },
      createdAt: Date.now(),
    })

    await ctx.db.patch(project._id, {
      locatic: {
        ...project.locatic,
        updatesCount: project.locatic.updatesCount + 1,
      },
      updatedAt: Date.now(),
    })

    const update = await ctx.db.get(updateId)
    if (!update) {
      return null
    }

    const eventId = await ctx.db.insert('activity_events', {
      actorId: viewer._id,
      eventType: 'update_broadcast',
      projectId: project._id,
      updateId,
      commentId: null,
      actorSnapshot: ownerSnapshot,
      projectSnapshot: buildProjectSnapshot(project),
      updateSnapshot: buildUpdateSnapshot(update),
      createdAt: update.createdAt,
    })

    const event = await ctx.db.get(eventId)
    if (event) {
      await fanOutActivityEventToFollowers(ctx, event)
    }

    return update
  },
})

export const remove = mutation({
  args: {
    updateId: v.id('updates'),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    const update = await ctx.db.get(args.updateId)
    if (!update || update.ownerId !== viewer._id) {
      throw new ConvexError('Update not found')
    }

    const project = await ctx.db.get(update.projectId)
    if (project) {
      await ctx.db.patch(project._id, {
        locatic: {
          ...project.locatic,
          updatesCount: Math.max(0, project.locatic.updatesCount - 1),
        },
        updatedAt: Date.now(),
      })
    }

    await ctx.db.delete(update._id)
    return null
  },
})

export const patchReactionCounts = internalMutation({
  args: {
    updateId: v.id('updates'),
    reactionCounts: v.record(v.string(), v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.updateId, {
      reactionCounts: args.reactionCounts,
    })
  },
})
