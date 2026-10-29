import { convexTest } from 'convex-test'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import schema from './schema'
import {
  NOW,
  fixtureClerkId,
  seedCity,
  seedProject,
  seedPost,
  seedUser,
  seedFollow,
  seedActivityEvent,
  seedHomeFeedItem,
  seedConversation,
  seedRelease,
  purgeFixtureAccount,
  BENGALURU,
  finishLifecycleOwnerSync,
  runAccountPurgePage,
} from './__tests__/fixtures.helpers'
import { buildActorSnapshot } from './lib/snapshots'
import { ACCOUNT_PURGE_RETENTION_MS } from './lib/account_deletion'

const modules = import.meta.glob('./**/*.ts')

describe('account lifecycle contract', () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }))
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it.each(['deletedAt', 'purgedAt'] as const)(
    'closes public graph reads for an account with %s at the epoch',
    async (field) => {
      const t = convexTest(schema, modules)
      const id = await seedUser(t, { username: 'ada' })
      const bob = await seedUser(t, { username: 'bob' })
      await seedFollow(t, id, bob)
      await t.run(async (ctx) => {
        const user = await ctx.db.get(id)
        await ctx.db.patch(id, {
          [field]: 0,
          privacy: { ...user!.privacy, followGraphVisibility: 'public' },
        })
      })
      expect(
        (
          await t.query(api.users.publicFollowGraphPage, {
            username: 'ada',
            kind: 'following',
            paginationOpts: { cursor: null, numItems: 10 },
          })
        ).page,
      ).toEqual([])
    },
  )

  it.each(['deletedAt', 'purgedAt'] as const)(
    'does not give an inactive %s admin privileged reads',
    async (field) => {
      vi.stubEnv('EMAIL_ADMIN_CLERK_IDS', fixtureClerkId('admin'))
      const t = convexTest(schema, modules)
      const id = await seedUser(t, { username: 'admin' })
      await t.run((ctx) => ctx.db.patch(id, { [field]: 0 }))
      await expect(
        t
          .withIdentity({ subject: fixtureClerkId('admin') })
          .query(api.emailCampaigns.list, {}),
      ).rejects.toThrow('Email admin account is inactive')
    },
  )

  it('treats a deleted session as a visitor for member-only public profiles', async () => {
    const t = convexTest(schema, modules)
    const id = await seedUser(t, { username: 'ada' })
    const bob = await seedUser(t, { username: 'bob' })
    await t.run(async (ctx) => {
      const user = await ctx.db.get(bob)
      await ctx.db.patch(bob, {
        privacy: { ...user!.privacy, profileVisibility: 'locatic_only' },
      })
      await ctx.db.patch(id, { deletedAt: NOW })
    })
    expect(
      await t
        .withIdentity({ subject: fixtureClerkId('ada') })
        .query(api.users.publicProfileOverview, { username: 'bob' }),
    ).toBeNull()
  })

  it('does not expose a deleted viewer through the legacy actor bootstrap action', async () => {
    const t = convexTest(schema, modules)
    const id = await seedUser(t, { username: 'ada' })
    await t.run((ctx) => ctx.db.patch(id, { deletedAt: NOW }))
    expect(
      await t
        .withIdentity({ subject: fixtureClerkId('ada') })
        .action(api.users.bootstrapActorSnapshot, {}),
    ).toBeNull()
  })

  it('hides the deleted profile from bootstrap and rejects ordinary writes', async () => {
    const t = convexTest(schema, modules)
    const id = await seedUser(t, { username: 'ada' })
    const client = t.withIdentity({ subject: fixtureClerkId('ada') })
    await client.mutation(api.users.deleteAccount, {})
    const bootstrap = await client.query(api.users.viewerBootstrap, {})
    expect(bootstrap.viewer).toBeNull()
    expect(bootstrap).toMatchObject({
      status: 'deletion_pending',
      needsOnboarding: false,
      accountLifecycle: {
        canRestore: true,
        purgeAfter: NOW + ACCOUNT_PURGE_RETENTION_MS,
      },
    })
    await expect(
      client.mutation(api.users.updateExploreConfig, {
        cityIds: [],
        stackPrefs: [],
        appearInExplore: true,
      }),
    ).rejects.toThrow('Account unavailable')
    expect((await t.run((ctx) => ctx.db.get(id)))?.deletedAt).toBe(NOW)
  })

  it('preserves the first deletion deadline and restores the original discovery preference', async () => {
    const t = convexTest(schema, modules)
    const cityId = await seedCity(t, BENGALURU)
    const id = await seedUser(t, { username: 'ada', cityId })
    const project = await seedProject(t, { ownerId: id, name: 'engine' })
    const client = t.withIdentity({ subject: fixtureClerkId('ada') })
    await client.mutation(api.users.deleteAccount, {})
    await finishLifecycleOwnerSync(t, id)
    vi.setSystemTime(NOW + 100)
    await client.mutation(api.users.deleteAccount, {})
    expect((await t.run((ctx) => ctx.db.get(id)))?.purgeAfter).toBe(
      NOW + ACCOUNT_PURGE_RETENTION_MS,
    )
    await client.mutation(api.users.restoreAccount, {})
    await finishLifecycleOwnerSync(t, id)
    const restored = await t.run((ctx) => ctx.db.get(id))
    expect(restored).toMatchObject({
      deletedAt: null,
      deactivatedAt: null,
      purgeAfter: null,
      appearInExplore: true,
    })
    expect(
      (await t.run((ctx) => ctx.db.get(project)))?.exploreOwner?.isEligible,
    ).toBe(true)
    expect((await t.run((ctx) => ctx.db.get(cityId)))?.stats).toMatchObject({
      builderCount: 1,
      projectCount: 1,
    })
    await t.mutation(internal.users.scrubDeletedAccount, { userId: id })
    expect(await t.run((ctx) => ctx.db.get(id))).toEqual(restored)
  })

  it('keeps a deactivated profile hidden after deletion is cancelled', async () => {
    const t = convexTest(schema, modules)
    const id = await seedUser(t, { username: 'ada' })
    const client = t.withIdentity({ subject: fixtureClerkId('ada') })
    await client.mutation(api.users.deactivateAccount, {})
    await finishLifecycleOwnerSync(t, id)
    expect(
      await t.query(api.users.publicProfileOverview, { username: 'ada' }),
    ).toBeNull()

    vi.setSystemTime(NOW + 1_000)
    await client.mutation(api.users.deleteAccount, {})
    await client.mutation(api.users.restoreAccount, {})
    await finishLifecycleOwnerSync(t, id)

    const restored = await t.run((ctx) => ctx.db.get(id))
    expect(restored).toMatchObject({
      deletedAt: null,
      deactivatedAt: NOW,
      purgeAfter: null,
      appearInExplore: false,
    })
    expect(restored).not.toHaveProperty('deletionPreviousDeactivatedAt')
    expect(restored).not.toHaveProperty('deletionPreviousAppearInExplore')
    expect(
      await t.query(api.users.publicProfileOverview, { username: 'ada' }),
    ).toBeNull()
  })

  it('restores an active member who had opted out of discovery as public and undiscoverable', async () => {
    const t = convexTest(schema, modules)
    const id = await seedUser(t, { username: 'ada' })
    await t.run((ctx) => ctx.db.patch(id, { appearInExplore: false }))
    const client = t.withIdentity({ subject: fixtureClerkId('ada') })
    await client.mutation(api.users.deleteAccount, {})
    await client.mutation(api.users.restoreAccount, {})
    await finishLifecycleOwnerSync(t, id)
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      deactivatedAt: null,
      appearInExplore: false,
    })
    expect(
      await t.query(api.users.publicProfileOverview, { username: 'ada' }),
    ).not.toBeNull()
  })

  it('records the state of each deletion request separately', async () => {
    const t = convexTest(schema, modules)
    const id = await seedUser(t, { username: 'ada' })
    const client = t.withIdentity({ subject: fixtureClerkId('ada') })
    await client.mutation(api.users.deleteAccount, {})
    await client.mutation(api.users.restoreAccount, {})
    vi.setSystemTime(NOW + 1_000)
    await client.mutation(api.users.deactivateAccount, {})
    vi.setSystemTime(NOW + 2_000)
    await client.mutation(api.users.deleteAccount, {})
    await client.mutation(api.users.restoreAccount, {})
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      deactivatedAt: NOW + 1_000,
      appearInExplore: false,
    })
  })

  it.each([
    ['deactivated earlier', 'deactivated', NOW - 1_000],
    ['deactivated in the same millisecond', 'deactivated', NOW],
    ['active before deletion', 'active', NOW],
  ] as const)(
    'restores a legacy pending deletion hidden when it was %s',
    async (_label, history, deactivatedAt) => {
      const t = convexTest(schema, modules)
      const id = await seedUser(t, { username: 'ada' })
      const client = t.withIdentity({ subject: fixtureClerkId('ada') })
      if (history === 'deactivated') {
        vi.setSystemTime(deactivatedAt)
        await client.mutation(api.users.deactivateAccount, {})
        vi.setSystemTime(NOW)
      }
      // The deletion patch written before previous-state fields existed:
      // it kept an existing deactivation or stamped one at deletion.
      await t.run((ctx) =>
        ctx.db.patch(id, {
          deletedAt: NOW,
          deactivatedAt,
          purgeAfter: NOW + ACCOUNT_PURGE_RETENTION_MS,
          appearInExplore: false,
        }),
      )
      await client.mutation(api.users.restoreAccount, {})
      await finishLifecycleOwnerSync(t, id)
      expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
        deletedAt: null,
        deactivatedAt,
        appearInExplore: false,
      })
      expect(
        await t.query(api.users.publicProfileOverview, { username: 'ada' }),
      ).toBeNull()
    },
  )

  it('rejects restoration exactly at the deadline', async () => {
    const t = convexTest(schema, modules)
    await seedUser(t, { username: 'ada' })
    const client = t.withIdentity({ subject: fixtureClerkId('ada') })
    await client.mutation(api.users.deleteAccount, {})
    vi.setSystemTime(NOW + ACCOUNT_PURGE_RETENTION_MS)
    await expect(client.mutation(api.users.restoreAccount, {})).rejects.toThrow(
      'Restoration window has ended',
    )
  })

  it('never scrubs an active user through an old scheduled entry point', async () => {
    const t = convexTest(schema, modules)
    const id = await seedUser(t, { username: 'ada' })
    const before = await t.run((ctx) => ctx.db.get(id))
    await t.mutation(internal.users.scrubDeletedAccount, { userId: id })
    expect(await t.run((ctx) => ctx.db.get(id))).toEqual(before)
  })

  it.each(['deletedAt', 'deactivatedAt', 'purgedAt'] as const)(
    'does not disclose or message a recipient with %s',
    async (field) => {
      const t = convexTest(schema, modules)
      await seedUser(t, { username: 'bob' })
      const id = await seedUser(t, { username: 'ada' })
      await t.run((ctx) => ctx.db.patch(id, { [field]: NOW }))
      const client = t.withIdentity({ subject: fixtureClerkId('bob') })
      expect(
        await client.query(api.conversations.getRecipientPreview, {
          otherUserId: id,
        }),
      ).toBeNull()
      await expect(
        client.mutation(api.conversations.sendFirstMessage, {
          otherUserId: id,
          content: 'Hello',
        }),
      ).rejects.toThrow('Recipient unavailable')
    },
  )

  it('does not repopulate deleted identity through a late provider write', async () => {
    const t = convexTest(schema, modules)
    const id = await seedUser(t, { username: 'ada' })
    await t.run((ctx) => ctx.db.patch(id, { deletedAt: NOW }))
    await t.mutation(internal.users.patchContributions, {
      userId: id,
      contributions: { totalContributions: 999, weeks: [], syncedAt: NOW },
    })
    expect(
      (await t.run((ctx) => ctx.db.get(id)))?.githubContributions,
    ).toBeUndefined()
    await expect(
      t.mutation(internal.users.ensureViewerFromIdentity, {
        clerkId: fixtureClerkId('ada'),
        email: 'ada@example.com',
        githubUsername: 'ada',
        githubUrl: 'https://github.com/ada',
        avatarUrl: '',
        displayName: 'Ada',
      }),
    ).rejects.toThrow('Account unavailable')
  })

  it('does not create new relationships to an account pending deletion', async () => {
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const id = await seedUser(t, { username: 'ada' })
    await seedUser(t, { username: 'bob' })
    await t.run((ctx) => ctx.db.patch(id, { deletedAt: NOW }))
    await expect(
      t
        .withIdentity({ subject: fixtureClerkId('bob') })
        .mutation(api.follows.follow, { targetUserId: id }),
    ).rejects.toThrow('User not found')
  })

  it('does not fan out old identity snapshots after deletion', async () => {
    const t = convexTest(schema, modules)
    const id = await seedUser(t, { username: 'ada' })
    const bob = await seedUser(t, { username: 'bob' })
    const project = await seedProject(t, { ownerId: id, name: 'engine' })
    const eventId = await seedActivityEvent(
      t,
      id,
      project,
      NOW,
      'project_posted',
    )
    await seedFollow(t, bob, id)
    await t.run((ctx) => ctx.db.patch(id, { deletedAt: NOW }))
    await t.mutation(internal.home.fanOutActivityEventBatch, {
      eventId,
      cursor: null,
    })
    expect(
      await t.run((ctx) => ctx.db.query('home_feed_items').collect()),
    ).toEqual([])
  })

  it('rejects onboarding and ignores late webhooks even with a zero deletion timestamp', async () => {
    const t = convexTest(schema, modules)
    const id = await seedUser(t, { username: 'ada' })
    await seedUser(t, { username: 'taken' })
    await t.run((ctx) =>
      ctx.db.patch(id, { deletedAt: 0, purgeAfter: NOW + 1 }),
    )
    const before = await t.run((ctx) => ctx.db.get(id))
    await t.mutation(internal.users.upsertFromClerkWebhook, {
      clerkId: fixtureClerkId('ada'),
      email: 'replacement@example.com',
      githubId: 123,
      githubUsername: 'taken',
      githubUrl: 'https://github.com/taken',
      displayName: 'Replacement',
      avatarUrl: 'https://example.com/private.png',
      emailVerified: true,
    })
    expect(await t.run((ctx) => ctx.db.get(id))).toEqual(before)
    await expect(
      t
        .withIdentity({ subject: fixtureClerkId('ada') })
        .mutation(api.users.completeOnboarding, {
          cityId: null,
          displayName: 'Ada',
          bio: '',
          buildStatus: 'building_solo',
          onboardingSelectedOwnedProjectIds: [],
          exploreCityIds: [],
          stackPrefs: [],
        }),
    ).rejects.toThrow('Account unavailable')
  })

  it('removes copied snapshots and preserves independently authored text with neutral target context', async () => {
    const t = convexTest(schema, modules)
    const id = await seedUser(t, {
      username: 'ada',
      displayName: 'Personal identity',
    })
    const bob = await seedUser(t, { username: 'bob' })
    const owned = await seedProject(t, {
      ownerId: id,
      name: 'private-notebook',
    })
    const other = await seedProject(t, { ownerId: bob, name: 'community' })
    const communityPost = await seedPost(t, owned, bob, NOW, {
      body: 'Keep this independent update',
    })
    const event = await seedActivityEvent(t, bob, owned, NOW, 'project_liked')
    await seedHomeFeedItem(t, bob, event)
    await seedRelease(t, owned, NOW)
    const conversation = await seedConversation(t, id, bob, {
      isRequest: false,
      lastMessageSenderId: id,
    })
    const ids = await t.run(async (ctx) => {
      const author = await ctx.db.get(id)
      const writer = await ctx.db.get(bob)
      const project = await ctx.db.get(other)
      const eventDoc = await ctx.db.get(event)
      if (!author || !writer || !project || !eventDoc?.projectSnapshot)
        throw new Error('missing fixture')
      const snapshot = {
        projectFullName: 'ada/private-notebook',
        projectOwner: 'ada',
        projectRepo: 'private-notebook',
        targetLabel: 'private-notebook',
        updateTitle: null,
      }
      const erasedComment = await ctx.db.insert('comments', {
        targetType: 'project',
        targetId: owned,
        authorId: id,
        parentId: null,
        content: 'Old deleted personal prose',
        replyCount: 0,
        likesCount: 0,
        isDeleted: true,
        authorSnapshot: await buildActorSnapshot(ctx.db, author),
        targetSnapshot: snapshot,
        createdAt: NOW,
      })
      const communityComment = await ctx.db.insert('comments', {
        targetType: 'project',
        targetId: owned,
        authorId: bob,
        parentId: null,
        content: 'Keep this independent comment',
        replyCount: 0,
        likesCount: 0,
        isDeleted: false,
        authorSnapshot: await buildActorSnapshot(ctx.db, writer),
        targetSnapshot: snapshot,
        createdAt: NOW,
      })
      await ctx.db.patch(other, {
        topContributorsSnapshot: [
          {
            userId: id,
            displayName: author.profile.displayName,
            avatarUrl: author.profile.avatarUrl,
            commitCount: 5,
          },
        ],
        contributorStats: { ...project.contributorStats, matchedCount: 1 },
      })
      await ctx.db.insert('project_contributors', {
        projectId: other,
        userId: id,
        githubId: author.github.id!,
        githubUsername: author.github.username,
        commitCount: 5,
        role: 'contributor',
        isActive: true,
        firstMatchedAt: NOW,
        lastConfirmedAt: NOW,
        userSnapshot: {
          displayName: author.profile.displayName,
          avatarUrl: author.profile.avatarUrl,
        },
      })
      await ctx.db.insert('pulse_snapshots', {
        scopeType: 'global',
        scopeId: null,
        timeWindow: 'week',
        sort: 'locatic_likes',
        rank: 1,
        score: 1,
        projectId: String(owned),
        projectSnapshot: eventDoc.projectSnapshot,
        computedAt: NOW,
      })
      await ctx.db.patch(bob, { unreadMessagesCount: 5 })
      return { erasedComment, communityComment }
    })
    await t.run((ctx) =>
      ctx.db.patch(id, {
        deletedAt: NOW,
        deactivatedAt: NOW,
        purgeAfter: NOW + 1,
      }),
    )
    const summary = await t
      .withIdentity({ subject: fixtureClerkId('bob') })
      .query(api.conversations.getSummary, {
        conversationId: conversation.conversationId,
      })
    expect(summary?.otherUser).toMatchObject({
      displayName: 'account unavailable',
      githubUsername: '',
      avatarUrl: null,
      cityName: null,
    })
    await purgeFixtureAccount(t, id)
    expect(
      await t.run((ctx) => ctx.db.get(conversation.conversationId)),
    ).toBeNull()
    expect((await t.run((ctx) => ctx.db.get(bob)))?.unreadMessagesCount).toBe(4)
    await t.mutation(internal.users.scrubDeletedAccount, { userId: id })
    expect((await t.run((ctx) => ctx.db.get(bob)))?.unreadMessagesCount).toBe(4)
    expect(await t.run((ctx) => ctx.db.get(ids.erasedComment))).toMatchObject({
      content: '[deleted]',
      authorSnapshot: {
        displayName: 'Deleted User',
        avatarUrl: '',
        cityId: null,
        cityName: null,
      },
    })
    expect(
      await t.run((ctx) => ctx.db.get(ids.communityComment)),
    ).toMatchObject({
      content: 'Keep this independent comment',
      isDeleted: false,
      targetSnapshot: {
        projectOwner: 'deleted',
        projectFullName: 'deleted/deleted-project',
      },
    })
    expect(await t.run((ctx) => ctx.db.get(communityPost))).toMatchObject({
      body: 'Keep this independent update',
      projectSnapshot: { ownerLogin: 'deleted' },
    })
    expect(
      (await t.run((ctx) => ctx.db.get(other)))?.topContributorsSnapshot,
    ).toEqual([])
    for (const table of [
      'activity_events',
      'home_feed_items',
      'pulse_snapshots',
      'project_contributors',
      'project_releases',
      'messages',
    ] as const)
      expect(await t.run((ctx) => ctx.db.query(table).collect())).toEqual([])
  })

  it('purges in bounded resumable pages and leaves only a neutral account marker', async () => {
    const t = convexTest(schema, modules)
    const cityId = await seedCity(t, BENGALURU)
    const id = await seedUser(t, {
      username: 'erased-handle',
      cityId,
      withContributions: true,
    })
    const bob = await seedUser(t, { username: 'bob' })
    const projectId = await seedProject(t, {
      ownerId: id,
      name: 'personal-repo',
    })
    const otherProjectId = await seedProject(t, {
      ownerId: bob,
      name: 'community',
    })
    for (let index = 0; index < 31; index++) {
      await seedPost(t, otherProjectId, id, NOW + index, {
        body: 'erased private prose',
        deletedAt: index === 0 ? NOW - 1 : null,
      })
    }
    await t.run(async (ctx) => {
      await ctx.db.patch(id, {
        deletedAt: NOW - ACCOUNT_PURGE_RETENTION_MS,
        deactivatedAt: NOW - ACCOUNT_PURGE_RETENTION_MS,
        purgeAfter: NOW,
      })
      await ctx.db.insert('github_tokens', {
        userId: id,
        tokenStatus: 'active',
        scopes: [],
        lastUsedAt: NOW,
        lastValidatedAt: NOW,
        lastError: 'erased-handle diagnostics',
        createdAt: NOW,
        updatedAt: NOW,
      })
      await ctx.db.insert('explore_history', {
        userId: id,
        projectId: otherProjectId,
        firstSeenAt: NOW,
        lastSeenAt: NOW,
        dismissedAt: null,
        likedAt: null,
      })
    })
    await runAccountPurgePage(t, id)
    expect((await t.run((ctx) => ctx.db.get(id)))?.purgedAt).toBeNull()
    for (
      let page = 0;
      page < 500 && (await t.run((ctx) => ctx.db.get(id)))?.purgedAt == null;
      page++
    ) {
      await runAccountPurgePage(t, id)
    }
    const user = await t.run((ctx) => ctx.db.get(id))
    expect(user?.purgedAt).toBe(NOW)
    expect(user?.clerkId).toBe(fixtureClerkId('erased-handle'))
    const { clerkId: _clerkId, ...neutral } = user!
    expect(JSON.stringify(neutral)).not.toContain('erased-handle')
    expect(user).toMatchObject({
      github: { id: null },
      profile: { cityId: null, avatarUrl: '', fullName: null },
      appearInExplore: false,
    })
    expect(user).not.toHaveProperty('githubContributions')
    expect(await t.run((ctx) => ctx.db.get(projectId))).toBeNull()
    expect(await t.run((ctx) => ctx.db.get(otherProjectId))).not.toBeNull()
    expect(
      await t.run((ctx) => ctx.db.query('github_tokens').collect()),
    ).toEqual([])
    expect(
      await t.run((ctx) => ctx.db.query('explore_history').collect()),
    ).toEqual([])
    const posts = await t.run((ctx) => ctx.db.query('posts').collect())
    expect(posts).toHaveLength(31)
    expect(JSON.stringify(posts)).not.toContain('erased-handle')
    expect(JSON.stringify(posts)).not.toContain('erased private prose')
    await t.mutation(internal.users.patchGithubIdFromBackfill, {
      userId: id,
      githubId: 123,
    })
    await t.mutation(internal.github.recordGithubTokenState, {
      userId: id,
      tokenStatus: 'active',
      scopes: [],
      lastError: null,
    })
    expect((await t.run((ctx) => ctx.db.get(id)))?.github.id).toBeNull()
    expect(
      await t.run((ctx) => ctx.db.query('github_tokens').collect()),
    ).toEqual([])
    await t.mutation(internal.github.patchProjectReleases, {
      projectId,
      releases: [
        {
          githubReleaseId: 1,
          tagName: 'v1',
          name: 'erased-handle release',
          body: 'erased private prose',
          htmlUrl: 'https://github.com/erased-handle/personal-repo/releases/v1',
          isDraft: false,
          isPrerelease: false,
          publishedAt: NOW,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    })
    expect(
      await t.run((ctx) => ctx.db.query('project_releases').collect()),
    ).toEqual([])
  })
})
