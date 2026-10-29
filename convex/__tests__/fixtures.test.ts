import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from '../schema'
import { getProjectTopics } from '../lib/topics'
import {
  daysAgo,
  seedActivityEvent,
  seedConversation,
  seedEmptyCity,
  seedFailedSync,
  seedFollow,
  seedHomeFeedItem,
  seedNotification,
  seedPopulatedCity,
  seedPrivacyVariants,
} from './fixtures.helpers'

const modules = import.meta.glob('../**/*.ts')

describe('convex fixtures', () => {
  it('seeds the populated city with schema-valid, uneven data', async () => {
    const t = convexTest(schema, modules)
    const fixture = await seedPopulatedCity(t)

    const counts = await t.run(async (ctx) => {
      const projects = await ctx.db.query('projects').collect()
      return {
        cities: (await ctx.db.query('cities').collect()).length,
        users: (await ctx.db.query('users').collect()).length,
        projects,
        releases: (await ctx.db.query('project_releases').collect()).length,
        posts: (await ctx.db.query('posts').collect()).length,
        bengaluruExploreEligible: projects.filter(
          (project) =>
            project.exploreOwner.cityId === fixture.cities.bengaluru &&
            project.exploreOwner.isEligible,
        ).length,
      }
    })

    expect(counts).toMatchObject({
      cities: 6,
      users: 7,
      releases: 4,
      posts: 5,
      // Only exact-city owners are Bengaluru members: alice x2, bob and
      // carol. dev (region-only) and erin (hidden) store no member city;
      // gwen (out of discovery) is a member but not eligible.
      bengaluruExploreEligible: 4,
    })
    // Posts about gwen's projects hold no city (`getPostCityId`), so city
    // post indexes never reach them.
    const gwenPost = await t.run((ctx) => ctx.db.get(fixture.posts.gwenBot))
    expect(gwenPost?.projectCityId).toBeNull()
    expect(
      counts.projects.filter(
        (project) => project.github.primaryLanguage === 'TypeScript',
      ),
    ).toHaveLength(5)
    const topicCounts = counts.projects
      .flatMap((project) => getProjectTopics(project))
      .reduce<Record<string, number>>((acc, topic) => {
        acc[topic] = (acc[topic] ?? 0) + 1
        return acc
      }, {})
    expect(topicCounts).toMatchObject({ ai: 4, webgpu: 1 })
    expect(topicCounts.cli).toBeUndefined()
  })

  it('seeds the empty city, privacy variants and social records', async () => {
    const t = convexTest(schema, modules)
    const { users, projects } = await seedPopulatedCity(t)
    const empty = await seedEmptyCity(t)
    const variants = await seedPrivacyVariants(t)

    await seedFollow(t, users.alice, users.bob)
    const postId = (await t.run((ctx) => ctx.db.query('posts').collect())).find(
      (post) => post.projectId === projects.bobCli,
    )!._id
    const recent = await seedActivityEvent(
      t,
      users.bob,
      projects.bobCli,
      daysAgo(2),
      'post_created',
      { postId },
    )
    const old = await seedActivityEvent(
      t,
      users.bob,
      projects.bobCli,
      daysAgo(40),
      'project_posted',
    )
    await seedHomeFeedItem(t, users.alice, recent)
    await seedHomeFeedItem(t, users.alice, old)
    const { conversationId } = await seedConversation(
      t,
      users.alice,
      users.frank,
      { isRequest: true, lastMessageSenderId: users.alice },
    )
    await seedNotification(t, {
      recipientId: users.frank,
      actorId: users.alice,
      type: 'dm_received',
      conversationId,
    })
    await seedFailedSync(t, {
      userId: users.carol,
      projectId: projects.carolEngine,
    })

    const state = await t.run(async (ctx) => ({
      emptyCityProjects: (await ctx.db.query('projects').collect()).filter(
        (project) => project.exploreOwner.cityId === empty.cityId,
      ).length,
      variantUsers: await Promise.all(
        Object.values(variants.users).map((id) => ctx.db.get(id)),
      ),
      feedItems: await ctx.db
        .query('home_feed_items')
        .withIndex('by_user_created', (query) =>
          query.eq('userId', users.alice),
        )
        .collect(),
      conversation: await ctx.db.get(conversationId),
      notification: await ctx.db.query('notifications').first(),
      carolEngine: await ctx.db.get(projects.carolEngine),
    }))

    expect(state.emptyCityProjects).toBe(0)
    expect(
      new Set(
        state.variantUsers.map(
          (user) => `${user?.privacy.cityVisibility}:${user?.appearInExplore}`,
        ),
      ).size,
    ).toBe(6)
    expect(
      state.feedItems.map((item) => item.createdAt).sort((a, b) => a - b),
    ).toEqual([daysAgo(40), daysAgo(2)])
    expect(state.conversation).toMatchObject({
      isRequest: true,
      lastMessage: { senderId: users.alice },
    })
    expect(state.notification?.target).toMatchObject({
      kind: 'conversation',
      inboxTab: 'requests',
    })
    expect(
      state.carolEngine!.github.lastMetadataSyncAttemptedAt,
    ).toBeGreaterThan(state.carolEngine!.github.lastMetadataSyncedAt!)
  })
})
