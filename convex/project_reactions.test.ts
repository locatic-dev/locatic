import { purgeFixtureAccount } from './__tests__/fixtures.helpers'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import { createDefaultViewerProfile } from './lib/viewer'

const modules = import.meta.glob('./**/*.ts')

function createTestUser(clerkId: string, username: string) {
  return createDefaultViewerProfile({
    clerkId,
    email: `${username}@example.com`,
    githubId: null,
    githubUsername: username,
    githubUrl: `https://github.com/${username}`,
    avatarUrl: `https://example.com/${username}.png`,
    displayName: username,
  })
}

function createTestProject(ownerId: Id<'users'>, likesCount = 0) {
  const now = Date.now()
  return {
    ownerId,
    github: {
      repoId: 1,
      fullName: 'owner/project',
      ownerLogin: 'owner',
      ownerLoginKey: 'owner',
      name: 'project',
      nameKey: 'project',
      description: null,
      githubUrl: 'https://github.com/owner/project',
      projectUrl: null,
      primaryLanguage: 'TypeScript',
      languages: [{ name: 'TypeScript', bytes: 100 }],
      topics: [],
      stargazersCount: 1,
      lastCommitAt: now,
      lastMetadataSyncedAt: null,
      lastMetadataSyncAttemptedAt: null,
      commitFrequency: 'active' as const,
      readmePreview: null,
      readmeAssetBaseUrl: null,
      readmeAssetRootUrl: null,
      readmeLinkBaseUrl: null,
      readmeLinkRootUrl: null,
    },
    locatic: {
      isVisible: true,
      tags: [],
      likesCount,
      commentsCount: 0,
      postsCount: 0,
    },
    exploreOwner: {
      cityId: null,
      appearInExplore: true,
      isActive: true,
      isEligible: true,
    },
    ownerSnapshot: {
      displayName: 'owner',
      avatarUrl: 'https://example.com/owner.png',
      cityId: null,
      cityName: null,
      buildStatus: 'building_solo' as const,
    },
    topContributorsSnapshot: [],
    contributorStats: {
      matchedCount: 0,
      lastSyncedAt: null,
      lastSyncAttemptedAt: null,
      syncCadence: 'weekly' as const,
    },
    addedToLocaticAt: now,
    updatedAt: now,
  }
}

async function createFixture() {
  const t = convexTest(schema, modules)
  rateLimiterTest.register(t)
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert(
      'users',
      createTestUser('owner', 'owner'),
    )
    const viewerId = await ctx.db.insert(
      'users',
      createTestUser('viewer', 'viewer'),
    )
    const followerId = await ctx.db.insert(
      'users',
      createTestUser('follower', 'follower'),
    )
    const projectId = await ctx.db.insert(
      'projects',
      createTestProject(ownerId),
    )
    await ctx.db.insert('follows', {
      followerId,
      followingId: viewerId,
      createdAt: Date.now(),
    })
    await ctx.db.insert('explore_history', {
      userId: viewerId,
      projectId,
      firstSeenAt: 1,
      lastSeenAt: 1,
      dismissedAt: 1,
      likedAt: null,
    })
    await ctx.db.insert('reaction_config', {
      key: 'like',
      label: 'Like',
      emoji: '❤️',
      targetTypes: ['project'],
      isActive: true,
      sortOrder: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await ctx.db.insert('reaction_config', {
      key: 'rocket',
      label: 'Rocket',
      emoji: '🚀',
      targetTypes: ['project'],
      isActive: true,
      sortOrder: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    return { followerId, ownerId, projectId, viewerId }
  })
  return { ids, t, viewer: t.withIdentity({ subject: 'viewer' }) }
}

describe('project reaction mutations', () => {
  afterEach(() => vi.useRealTimers())

  it('applies every project-like side effect once and removes counts safely', async () => {
    vi.useFakeTimers()
    const { ids, t, viewer } = await createFixture()

    await viewer.mutation(api.reactions.reactToTarget, {
      targetType: 'project',
      targetId: String(ids.projectId),
      reactionType: 'like',
    })
    const initialHistory = await t.run(async (ctx) =>
      ctx.db.query('explore_history').unique(),
    )
    vi.setSystemTime(Date.now() + 60_000)
    await viewer.mutation(api.reactions.reactToTarget, {
      targetType: 'project',
      targetId: String(ids.projectId),
      reactionType: 'like',
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    await t.run(async (ctx) => {
      const project = await ctx.db.get(ids.projectId)
      const viewerUser = await ctx.db.get(ids.viewerId)
      const reactions = await ctx.db.query('reactions').collect()
      const events = await ctx.db.query('activity_events').collect()
      const feedItems = await ctx.db.query('home_feed_items').collect()
      const notifications = await ctx.db.query('notifications').collect()
      const history = await ctx.db.query('explore_history').unique()

      expect(project?.locatic.likesCount).toBe(1)
      expect(project?.locatic.reactionCounts).toEqual({ like: 1 })
      expect(viewerUser?.stats.likedCount).toBe(1)
      expect(reactions).toHaveLength(1)
      expect(events).toHaveLength(1)
      expect(events[0]?.projectSnapshot?.likesCount).toBe(1)
      expect(feedItems).toHaveLength(1)
      expect(feedItems[0]?.userId).toBe(ids.followerId)
      expect(notifications).toHaveLength(1)
      expect(notifications[0]?.recipientId).toBe(ids.ownerId)
      expect(history?.dismissedAt).toBeNull()
      expect(history?.likedAt).not.toBeNull()
      expect(history?.likedAt).toBe(initialHistory?.likedAt)
      expect(history?.lastSeenAt).toBe(initialHistory?.lastSeenAt)
    })

    await t.run(async (ctx) => {
      const project = await ctx.db.get(ids.projectId)
      if (project) {
        await ctx.db.patch(project._id, {
          locatic: { ...project.locatic, isVisible: false },
        })
      }
    })
    await viewer.mutation(api.reactions.unreactFromTarget, {
      targetType: 'project',
      targetId: String(ids.projectId),
      reactionType: 'like',
    })
    await viewer.mutation(api.reactions.unreactFromTarget, {
      targetType: 'project',
      targetId: String(ids.projectId),
      reactionType: 'like',
    })

    await t.run(async (ctx) => {
      const project = await ctx.db.get(ids.projectId)
      const viewerUser = await ctx.db.get(ids.viewerId)
      expect(project?.locatic.likesCount).toBe(0)
      expect(project?.locatic.reactionCounts).toEqual({ like: 0 })
      expect(viewerUser?.stats.likedCount).toBe(0)
      expect(await ctx.db.query('reactions').collect()).toHaveLength(0)
    })
  })

  it('keeps non-like project reactions free of like-only side effects', async () => {
    const { ids, t, viewer } = await createFixture()

    await viewer.mutation(api.reactions.reactToTarget, {
      targetType: 'project',
      targetId: String(ids.projectId),
      reactionType: 'rocket',
    })

    await t.run(async (ctx) => {
      const project = await ctx.db.get(ids.projectId)
      const viewerUser = await ctx.db.get(ids.viewerId)
      expect(project?.locatic.likesCount).toBe(0)
      expect(project?.locatic.reactionCounts).toEqual({
        like: 0,
        rocket: 1,
      })
      expect(viewerUser?.stats.likedCount).toBe(0)
      expect(await ctx.db.query('activity_events').collect()).toHaveLength(0)
      expect(await ctx.db.query('home_feed_items').collect()).toHaveLength(0)
      expect(await ctx.db.query('notifications').collect()).toHaveLength(0)
    })

    await t.run(async (ctx) => {
      const project = await ctx.db.get(ids.projectId)
      if (project) {
        await ctx.db.patch(project._id, {
          locatic: { ...project.locatic, isVisible: false },
        })
      }
    })
    await viewer.mutation(api.reactions.unreactFromTarget, {
      targetType: 'project',
      targetId: String(ids.projectId),
      reactionType: 'rocket',
    })
    await viewer.mutation(api.reactions.unreactFromTarget, {
      targetType: 'project',
      targetId: String(ids.projectId),
      reactionType: 'rocket',
    })

    await t.run(async (ctx) => {
      const project = await ctx.db.get(ids.projectId)
      expect(project?.locatic.likesCount).toBe(0)
      expect(project?.locatic.reactionCounts).toEqual({
        like: 0,
        rocket: 0,
      })
      expect(await ctx.db.query('reactions').collect()).toHaveLength(0)
    })
  })

  it('keeps the legacy Home like mutation on the canonical path', async () => {
    vi.useFakeTimers()
    const { ids, t } = await createFixture()

    await t.mutation(internal.github.applyProjectLike, {
      clerkId: 'viewer',
      projectId: ids.projectId,
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    await t.run(async (ctx) => {
      const project = await ctx.db.get(ids.projectId)
      const viewer = await ctx.db.get(ids.viewerId)
      expect(project?.locatic.reactionCounts).toEqual({ like: 1 })
      expect(project?.locatic.likesCount).toBe(1)
      expect(viewer?.stats.likedCount).toBe(1)
      expect(await ctx.db.query('activity_events').collect()).toHaveLength(1)
      expect(await ctx.db.query('notifications').collect()).toHaveLength(1)
      expect(await ctx.db.query('home_feed_items').collect()).toHaveLength(1)
    })
  })

  it('fans out large follower sets in idempotent bounded pages', async () => {
    vi.useFakeTimers()
    const { ids, t, viewer } = await createFixture()
    await t.run(async (ctx) => {
      for (let index = 0; index < 100; index += 1) {
        const followerId = await ctx.db.insert(
          'users',
          createTestUser(`extra-${index}`, `extra-${index}`),
        )
        await ctx.db.insert('follows', {
          followerId,
          followingId: ids.viewerId,
          createdAt: Date.now(),
        })
      }
    })

    await viewer.mutation(api.reactions.reactToTarget, {
      targetType: 'project',
      targetId: String(ids.projectId),
      reactionType: 'like',
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const eventId = await t.run(
      async (ctx) => (await ctx.db.query('activity_events').unique())?._id,
    )
    expect(eventId).toBeDefined()
    if (!eventId) return

    await t.mutation(internal.home.fanOutActivityEventBatch, {
      eventId,
      cursor: null,
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    await t.run(async (ctx) => {
      expect(await ctx.db.query('home_feed_items').collect()).toHaveLength(101)
    })
  })

  it('scrubs typed project reaction counters without corrupting likes', async () => {
    const { ids, t } = await createFixture()
    const targetIds = await t.run(async (ctx) => {
      const project = await ctx.db.get(ids.projectId)
      if (!project) throw new Error('Expected project fixture')
      await ctx.db.patch(project._id, {
        locatic: {
          ...project.locatic,
          likesCount: 1,
          reactionCounts: { like: 1, rocket: 1 },
        },
      })
      await ctx.db.insert('reactions', {
        userId: ids.viewerId,
        targetType: 'project',
        targetId: String(ids.projectId),
        reactionType: 'like',
        createdAt: Date.now(),
      })
      await ctx.db.insert('reactions', {
        userId: ids.viewerId,
        targetType: 'project',
        targetId: String(ids.projectId),
        reactionType: 'rocket',
        createdAt: Date.now(),
      })
      const actorSnapshot = {
        displayName: 'owner',
        avatarUrl: 'https://example.com/owner.png',
        cityId: null,
        cityName: null,
      }
      const postId = await ctx.db.insert('posts', {
        projectId: project._id,
        ownerId: ids.ownerId,
        actorId: ids.ownerId,
        authorRole: 'owner',
        body: 'An update',
        reactionCounts: { like: 1, rocket: 1 },
        commentsCount: 0,
        projectCityId: null,
        projectTopics: [],
        actorSnapshot,
        projectSnapshot: {
          name: project.github.name,
          fullName: project.github.fullName,
          ownerLogin: project.github.ownerLogin,
          primaryLanguage: project.github.primaryLanguage,
          languages: project.github.languages,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
      })
      const commentId = await ctx.db.insert('comments', {
        targetType: 'project',
        targetId: String(project._id),
        authorId: ids.ownerId,
        parentId: null,
        content: 'A comment',
        replyCount: 0,
        likesCount: 1,
        reactionCounts: { like: 1, rocket: 1 },
        isDeleted: false,
        authorSnapshot: actorSnapshot,
        targetSnapshot: {
          projectFullName: project.github.fullName,
          projectOwner: project.github.ownerLogin,
          projectRepo: project.github.name,
          targetLabel: project.github.name,
          updateTitle: null,
        },
        createdAt: Date.now(),
      })
      for (const target of [
        { targetId: String(postId), targetType: 'post' as const },
        { targetId: String(commentId), targetType: 'comment' as const },
      ]) {
        for (const reactionType of ['like', 'rocket']) {
          await ctx.db.insert('reactions', {
            userId: ids.viewerId,
            ...target,
            reactionType,
            createdAt: Date.now(),
          })
        }
      }
      return { commentId, postId }
    })

    await purgeFixtureAccount(t, ids.viewerId)

    await t.run(async (ctx) => {
      const project = await ctx.db.get(ids.projectId)
      expect(project?.locatic.likesCount).toBe(0)
      expect(project?.locatic.reactionCounts).toEqual({
        like: 0,
        rocket: 0,
      })
      expect((await ctx.db.get(targetIds.postId))?.reactionCounts).toEqual({
        like: 0,
        rocket: 0,
      })
      const comment = await ctx.db.get(targetIds.commentId)
      expect(comment?.likesCount).toBe(0)
      expect(comment?.reactionCounts).toEqual({ like: 0, rocket: 0 })
      expect(await ctx.db.query('reactions').collect()).toHaveLength(0)
    })
  })

  it('backfills bounded batches while preserving legacy like totals', async () => {
    vi.useFakeTimers()
    const t = convexTest(schema, modules)
    const projectIds = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert(
        'users',
        createTestUser('owner', 'owner'),
      )
      const firstId = await ctx.db.insert(
        'projects',
        createTestProject(ownerId, 4),
      )
      const migrated = createTestProject(ownerId, 2)
      const secondId = await ctx.db.insert('projects', {
        ...migrated,
        github: { ...migrated.github, repoId: 2, name: 'second' },
        locatic: { ...migrated.locatic, reactionCounts: { like: 2 } },
      })
      await ctx.db.insert('reactions', {
        userId: ownerId,
        targetType: 'project',
        targetId: String(firstId),
        reactionType: 'like',
        createdAt: Date.now(),
      })
      await ctx.db.insert('reactions', {
        userId: ownerId,
        targetType: 'project',
        targetId: String(firstId),
        reactionType: 'rocket',
        createdAt: Date.now(),
      })
      return { firstId, secondId }
    })

    const result = await t.mutation(
      internal.projects.backfillProjectReactionCounts,
      { limit: 1 },
    )
    expect(result.scheduledContinuation).toBe(true)
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    await t.run(async (ctx) => {
      expect(
        (await ctx.db.get(projectIds.firstId))?.locatic.reactionCounts,
      ).toEqual({ like: 4, rocket: 1 })
      expect(
        (await ctx.db.get(projectIds.secondId))?.locatic.reactionCounts,
      ).toEqual({ like: 2 })
    })
  })
})
