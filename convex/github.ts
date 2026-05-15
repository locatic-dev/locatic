import { ConvexError, v } from 'convex/values'

import { internalMutation, internalQuery } from './_generated/server'

export const applyProjectLike = internalMutation({
  args: {
    projectId: v.id('projects'),
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (query) => query.eq('clerkId', args.clerkId))
      .unique()
    const project = await ctx.db.get(args.projectId)

    if (!viewer || !project) {
      throw new ConvexError('Missing project or viewer')
    }

    const existing = await ctx.db
      .query('reactions')
      .withIndex('by_user_target_reaction', (query) =>
        query
          .eq('userId', viewer._id)
          .eq('targetId', String(project._id))
          .eq('reactionType', 'like'),
      )
      .unique()

    if (!existing) {
      await ctx.db.insert('reactions', {
        userId: viewer._id,
        targetType: 'project',
        targetId: String(project._id),
        reactionType: 'like',
        createdAt: Date.now(),
      })
    }

    await ctx.db.patch(project._id, {
      locatic: {
        ...project.locatic,
        likesCount: existing
          ? project.locatic.likesCount
          : project.locatic.likesCount + 1,
      },
      updatedAt: Date.now(),
    })

    const history = await ctx.db
      .query('explore_history')
      .withIndex('by_user_project', (query) =>
        query.eq('userId', viewer._id).eq('projectId', project._id),
      )
      .unique()

    if (history) {
      await ctx.db.patch(history._id, {
        likedAt: Date.now(),
        lastSeenAt: Date.now(),
      })
    }

    return null
  },
})

export const removeProjectLike = internalMutation({
  args: {
    projectId: v.id('projects'),
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (query) => query.eq('clerkId', args.clerkId))
      .unique()
    const project = await ctx.db.get(args.projectId)

    if (!viewer || !project) {
      throw new ConvexError('Missing project or viewer')
    }

    const existing = await ctx.db
      .query('reactions')
      .withIndex('by_user_target_reaction', (query) =>
        query
          .eq('userId', viewer._id)
          .eq('targetId', String(project._id))
          .eq('reactionType', 'like'),
      )
      .unique()

    if (existing) {
      await ctx.db.delete(existing._id)
    }

    await ctx.db.patch(project._id, {
      locatic: {
        ...project.locatic,
        likesCount: Math.max(
          0,
          project.locatic.likesCount - (existing ? 1 : 0),
        ),
      },
      updatedAt: Date.now(),
    })

    return null
  },
})

export const patchProjectMetadata = internalMutation({
  args: {
    projectId: v.id('projects'),
    repository: v.object({
      repoId: v.number(),
      fullName: v.string(),
      name: v.string(),
      description: v.union(v.string(), v.null()),
      githubUrl: v.string(),
      projectUrl: v.union(v.string(), v.null()),
      primaryLanguage: v.union(v.string(), v.null()),
      topics: v.array(v.string()),
      stargazersCount: v.number(),
      lastCommitAt: v.number(),
      lastMetadataSyncedAt: v.union(v.number(), v.null()),
      readmePreview: v.union(v.string(), v.null()),
    }),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId)
    if (!project) {
      return null
    }

    await ctx.db.patch(project._id, {
      github: {
        ...project.github,
        ...args.repository,
        commitFrequency:
          Date.now() - args.repository.lastCommitAt <= 7 * 24 * 60 * 60 * 1000
            ? 'active'
            : Date.now() - args.repository.lastCommitAt <=
                30 * 24 * 60 * 60 * 1000
              ? 'slow'
              : 'dormant',
      },
      updatedAt: Date.now(),
    })

    return null
  },
})

export const likedProjectsByUser = internalQuery({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const likes = await ctx.db
      .query('reactions')
      .withIndex('by_user_target_type', (query) =>
        query
          .eq('userId', args.userId)
          .eq('targetType', 'project')
          .eq('reactionType', 'like'),
      )
      .collect()

    const projects = await ctx.db.query('projects').collect()

    return likes.map((like) => {
      const project = projects.find(
        (entry) => String(entry._id) === like.targetId,
      )
      return {
        reactionId: like._id,
        projectId: like.targetId,
        projectFullName: project?.github.fullName ?? null,
      }
    })
  },
})

export const listRefreshableProjects = internalQuery({
  args: {},
  handler: async (ctx) => {
    return (await ctx.db.query('projects').collect()).filter(
      (project) => project.locatic.isVisible,
    )
  },
})
