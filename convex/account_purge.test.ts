import { convexTest } from 'convex-test'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import schema from './schema'
import type { Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { getConvexSize, type Value } from 'convex/values'
import { PURGE_QUERY_VERSION, purgeAccountPage } from './lib/account_purge'
import {
  NOW,
  fixtureClerkId,
  seedUser,
  seedProject,
  seedPost,
  seedFollow,
  seedActivityEvent,
  runAccountPurgePage,
  purgeFixtureAccount,
  seedConversation,
} from './__tests__/fixtures.helpers'

const modules = import.meta.glob('./**/*.ts')
beforeEach(() => vi.useFakeTimers({ now: NOW }))
afterEach(() => vi.useRealTimers())

it('does not let a new comment copy an expired collaborator post after activity was swept', async () => {
  const t = convexTest(schema, modules)
  rateLimiterTest.register(t)
  const author = await seedUser(t, { username: 'author' })
  const owner = await seedUser(t, { username: 'owner' })
  const projectId = await seedProject(t, { ownerId: owner, name: 'engine' })
  const postId = await seedPost(t, projectId, author, NOW, {
    body: 'Erase this authored text',
  })
  await t.run((ctx) =>
    ctx.db.patch(author, {
      deletedAt: NOW - 31 * 86_400_000,
      deactivatedAt: NOW - 31 * 86_400_000,
      purgeAfter: NOW,
    }),
  )
  for (let page = 0; page < 100; page++) {
    if (
      ((await t.run((ctx) => ctx.db.get(author)))?.purgeProgress?.stage ?? 0) >=
      8
    )
      break
    await runAccountPurgePage(t, author)
  }
  await expect(
    t
      .withIdentity({ subject: fixtureClerkId('owner') })
      .mutation(api.comments.create, {
        targetType: 'post',
        targetId: postId,
        parentId: null,
        content: 'A late reply',
      }),
  ).rejects.toThrow('Comment target not found')
  expect(await t.run((ctx) => ctx.db.query('activity_events').take(1))).toEqual(
    [],
  )
})

it.each(['due', 'purged'] as const)(
  'does not fan out a stale snapshot when its post author is %s',
  async (status) => {
    const t = convexTest(schema, modules)
    const author = await seedUser(t, { username: 'author' })
    const owner = await seedUser(t, { username: 'owner' })
    const follower = await seedUser(t, { username: 'follower' })
    const projectId = await seedProject(t, { ownerId: owner, name: 'engine' })
    const postId = await seedPost(t, projectId, author, NOW, {
      body: 'Erase this authored text',
    })
    const eventId = await seedActivityEvent(
      t,
      owner,
      projectId,
      NOW,
      'post_created',
      { postId },
    )
    await seedFollow(t, follower, owner)
    await t.run((ctx) =>
      ctx.db.patch(author, {
        deletedAt: NOW - 31 * 86_400_000,
        purgeAfter: status === 'due' ? NOW : null,
        ...(status === 'purged' ? { purgedAt: NOW } : {}),
      }),
    )
    await t.mutation(internal.home.fanOutActivityEventBatch, {
      eventId,
      cursor: null,
    })
    expect(
      await t.run((ctx) => ctx.db.query('home_feed_items').take(1)),
    ).toEqual([])
  },
)

const accountStages = [
  { table: 'reports', stage: 10 },
  { table: 'github_tokens', stage: 12 },
  { table: 'github_sync_log', stage: 13 },
  { table: 'email_sends', stage: 16 },
  { table: 'email_preference_changes', stage: 17 },
] as const

it.each(accountStages)(
  'purges $table through account indexes without reading unrelated rows',
  async ({ table, stage }) => {
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const erased = await seedUser(t, { username: 'erased' })
    const other = await seedUser(t, { username: 'other' })
    const projectId = await seedProject(t, { ownerId: other, name: 'engine' })
    const comment = await t
      .withIdentity({ subject: fixtureClerkId('other') })
      .mutation(api.comments.create, {
        targetType: 'project',
        targetId: projectId,
        parentId: null,
        content: 'Independent discussion',
      })
    const campaignId = await t.run((ctx) =>
      ctx.db.insert('email_campaigns', {
        title: 'Fixture',
        subject: 'Fixture',
        preheader: '',
        revision: 1,
        templateVersion: 2,
        state: 'sent',
        content: { kind: 'announcement', body: 'Hello', cta: null },
        preparationDiagnostics: [],
        createdBy: other,
        updatedBy: other,
        createdAt: NOW,
        updatedAt: NOW,
      }),
    )
    const insert = (userId: typeof erased, index: number) =>
      t.run(async (ctx) => {
        switch (table) {
          case 'reports':
            return await ctx.db.insert(table, {
              reporterId: userId,
              targetType: 'comment',
              targetId: comment!._id,
              reason: 'spam',
              details: null,
              status: 'open',
              createdAt: NOW + index,
              updatedAt: NOW,
            })
          case 'github_tokens':
            return await ctx.db.insert(table, {
              userId,
              tokenStatus: 'active',
              scopes: [],
              lastUsedAt: null,
              lastValidatedAt: null,
              lastError: null,
              createdAt: NOW + index,
              updatedAt: NOW,
            })
          case 'github_sync_log':
            return await ctx.db.insert(table, {
              userId,
              syncType: 'manual',
              reposFetched: 1,
              reposNew: 0,
              reposUpdated: 1,
              status: 'success',
              error: null,
              githubRateLimitRemaining: null,
              syncedAt: NOW + index,
            })
          case 'email_sends':
            return await ctx.db.insert(table, {
              userId,
              campaignId,
              category: 'product_updates',
              emailId: `fixture-${userId}-${index}`,
              status: 'delivered',
              createdAt: NOW + index,
              updatedAt: NOW,
            })
          case 'email_preference_changes':
            return await ctx.db.insert(table, {
              userId,
              category: 'product_updates',
              subscribed: false,
              source: 'settings',
              changedAt: NOW + index,
            })
        }
      })
    const unrelated: Awaited<ReturnType<typeof insert>>[] = []
    for (let index = 0; index < 56; index++) {
      const userId =
        table === 'github_tokens'
          ? await seedUser(t, { username: `unrelated-${index}` })
          : other
      unrelated.push(await insert(userId, index))
    }
    const enterStage = async () => {
      await t.run((ctx) =>
        ctx.db.patch(erased, {
          deletedAt: NOW - 31 * 86_400_000,
          purgeAfter: NOW,
          purgeProgress: { stage, cursor: null },
        }),
      )
    }
    const finishStage = async () => {
      let pages = 0
      while (
        (await t.run((ctx) => ctx.db.get(erased)))?.purgeProgress?.stage ===
        stage
      ) {
        await runAccountPurgePage(t, erased)
        if (++pages > 20) throw new Error('Purge stage did not finish')
      }
      return pages
    }
    await enterStage()
    expect(await finishStage()).toBe(1)

    const owned: Awaited<ReturnType<typeof insert>>[] = []
    const ownedCount = table === 'github_tokens' ? 1 : 56
    for (let index = 0; index < ownedCount; index++)
      owned.push(await insert(erased, index))
    await enterStage()
    expect(await finishStage()).toBe(Math.ceil(ownedCount / 25))
    expect(
      await t.run((ctx) => Promise.all(owned.map((id) => ctx.db.get(id)))),
    ).toEqual(owned.map(() => null))
    expect(
      (
        await t.run((ctx) => Promise.all(unrelated.map((id) => ctx.db.get(id))))
      ).every(Boolean),
    ).toBe(true)
  },
)

it('finishes an existing table-scan cursor without changing its query shape', async () => {
  const t = convexTest(schema, modules)
  const erased = await seedUser(t, { username: 'erased' })
  const other = await seedUser(t, { username: 'other' })
  await t.run(async (ctx) => {
    for (let index = 0; index < 31; index++)
      await ctx.db.insert('email_preference_changes', {
        userId: other,
        category: 'product_updates',
        subscribed: false,
        source: 'settings',
        changedAt: NOW + index,
      })
    // Old releases used a global table cursor. Keep its query shape for the
    // rest of this stage instead of handing the cursor to a different index.
    const first = await ctx.db
      .query('email_preference_changes')
      .paginate({ cursor: null, numItems: 25 })
    await ctx.db.patch(erased, {
      deletedAt: NOW - 31 * 86_400_000,
      purgeAfter: NOW,
      purgeProgress: { stage: 17, cursor: first.continueCursor },
    })
    await ctx.db.insert('email_preference_changes', {
      userId: erased,
      category: 'product_updates',
      subscribed: false,
      source: 'settings',
      changedAt: NOW,
    })
  })
  await runAccountPurgePage(t, erased)
  expect((await t.run((ctx) => ctx.db.get(erased)))?.purgeProgress?.stage).toBe(
    18,
  )
  const rows = await t.run((ctx) =>
    ctx.db.query('email_preference_changes').collect(),
  )
  expect(rows).toHaveLength(31)
  expect(rows.every((row) => row.userId === other)).toBe(true)
})

const MESSAGES_STAGE = 4
const DUE = {
  deletedAt: NOW - 31 * 86_400_000,
  deactivatedAt: NOW - 31 * 86_400_000,
  purgeAfter: NOW - 1,
}

async function scheduledPurgeJobs(t: ReturnType<typeof convexTest>) {
  return (
    await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect())
  ).filter(
    (job) =>
      job.name.includes('scrubDeletedAccount') && job.state.kind === 'pending',
  )
}

describe('purge scheduling', () => {
  it('claims a due purge once and leaves running purges out of later cleanup', async () => {
    const t = convexTest(schema, modules)
    const erased = await seedUser(t, { username: 'erased' })
    await t.run((ctx) => ctx.db.patch(erased, DUE))

    const first = await t.mutation(internal.cleanup.runDailyCleanup, {})
    expect(first.scheduledAccountPurges).toBe(1)
    expect(await t.run((ctx) => ctx.db.get(erased))).toMatchObject({
      purgeAfter: null,
      purgeProgress: { stage: 0, step: 0 },
    })

    const second = await t.mutation(internal.cleanup.runDailyCleanup, {})
    expect(second.scheduledAccountPurges).toBe(0)
    expect(await scheduledPurgeJobs(t)).toHaveLength(1)
  })

  it('reaches accounts behind a full batch without requeueing claimed ones', async () => {
    const t = convexTest(schema, modules)
    const ids = []
    for (let index = 0; index < 101; index++) {
      const id = await seedUser(t, { username: `erased-${index}` })
      await t.run((ctx) => ctx.db.patch(id, DUE))
      ids.push(id)
    }
    const first = await t.mutation(internal.cleanup.runDailyCleanup, {})
    expect(first).toMatchObject({
      scheduledAccountPurges: 100,
      scheduledContinuation: true,
    })
    const second = await t.mutation(internal.cleanup.runDailyCleanup, {})
    expect(second).toMatchObject({
      scheduledAccountPurges: 1,
      scheduledContinuation: false,
    })
    const third = await t.mutation(internal.cleanup.runDailyCleanup, {})
    expect(third.scheduledAccountPurges).toBe(0)
    const jobs = await scheduledPurgeJobs(t)
    expect(jobs).toHaveLength(101)
    expect(
      new Set(
        jobs.map((job) => String((job.args[0] as { userId: string }).userId)),
      ).size,
    ).toBe(101)
  })

  it('ignores the deadline timer, unclaimed entries and replayed steps once claimed', async () => {
    const t = convexTest(schema, modules)
    const erased = await seedUser(t, { username: 'erased' })
    await t.run((ctx) => ctx.db.patch(erased, DUE))
    await t.mutation(internal.cleanup.runDailyCleanup, {})
    await t.mutation(internal.users.scrubDeletedAccount, {
      userId: erased,
      expectedStep: 0,
    })
    const afterFirstPage = await t.run((ctx) => ctx.db.get(erased))
    expect(afterFirstPage?.purgeProgress?.step).toBe(1)

    await t.action(internal.users.purgeDeletedAccountIfDue, { userId: erased })
    await t.mutation(internal.users.scrubDeletedAccount, { userId: erased })
    await t.mutation(internal.users.scrubDeletedAccount, {
      userId: erased,
      expectedStep: 0,
    })
    expect(await t.run((ctx) => ctx.db.get(erased))).toEqual(afterFirstPage)
  })

  it('adopts progress written before claims exactly once', async () => {
    const t = convexTest(schema, modules)
    const erased = await seedUser(t, { username: 'erased' })
    await t.run((ctx) =>
      ctx.db.patch(erased, {
        ...DUE,
        purgeProgress: { stage: 2, cursor: null },
      }),
    )
    await t.mutation(internal.users.scrubDeletedAccount, { userId: erased })
    const adopted = await t.run((ctx) => ctx.db.get(erased))
    expect(adopted).toMatchObject({
      purgeAfter: null,
      purgeProgress: { step: 1 },
    })
    // A queued continuation from the old chain carries no step.
    await t.mutation(internal.users.scrubDeletedAccount, { userId: erased })
    expect(await t.run((ctx) => ctx.db.get(erased))).toEqual(adopted)
  })

  it('claims accounts deleted at the Unix epoch', async () => {
    const t = convexTest(schema, modules)
    const erased = await seedUser(t, { username: 'erased' })
    await t.run((ctx) =>
      ctx.db.patch(erased, { deletedAt: 0, deactivatedAt: 0, purgeAfter: 0 }),
    )
    const result = await t.mutation(internal.cleanup.runDailyCleanup, {})
    expect(result.scheduledAccountPurges).toBe(1)
  })

  it('stops scheduling once the account is a tombstone', async () => {
    const t = convexTest(schema, modules)
    const erased = await seedUser(t, { username: 'erased' })
    await purgeFixtureAccount(t, erased)
    const tombstone = await t.run((ctx) => ctx.db.get(erased))
    expect(tombstone?.purgeProgress).toBeUndefined()
    await t.mutation(internal.users.scrubDeletedAccount, { userId: erased })
    expect(await t.run((ctx) => ctx.db.get(erased))).toEqual(tombstone)
  })
})

describe('indexed purge phases', () => {
  async function runStage(
    t: ReturnType<typeof convexTest>,
    userId: Id<'users'>,
    stage: number,
  ) {
    let pages = 0
    while (
      (await t.run((ctx) => ctx.db.get(userId)))?.purgeProgress?.stage === stage
    ) {
      await runAccountPurgePage(t, userId)
      if (++pages > 50) throw new Error('Purge stage did not finish')
    }
    return pages
  }

  async function insertMessage(
    t: ReturnType<typeof convexTest>,
    conversationId: Id<'conversations'>,
    senderId: Id<'users'>,
    content: string,
  ) {
    return await t.run((ctx) =>
      ctx.db.insert('messages', {
        conversationId,
        senderId,
        content,
        readAt: null,
        createdAt: NOW,
      }),
    )
  }

  it.each([100, 200])(
    'erases messages in a fixed number of pages beside %i unrelated messages',
    async (unrelatedCount) => {
      const t = convexTest(schema, modules)
      const erased = await seedUser(t, { username: 'erased' })
      const bob = await seedUser(t, { username: 'bob' })
      const carol = await seedUser(t, { username: 'carol' })
      const unrelated = await seedConversation(t, bob, carol, {
        lastMessageSenderId: bob,
        isRequest: false,
      })
      for (let index = 0; index < unrelatedCount; index++)
        await insertMessage(
          t,
          unrelated.conversationId,
          carol,
          `other ${index}`,
        )
      const incoming = await seedConversation(t, erased, bob, {
        lastMessageSenderId: bob,
        isRequest: false,
      })
      const orphan = await seedConversation(t, erased, carol, {
        lastMessageSenderId: erased,
        isRequest: false,
      })
      await t.run((ctx) => ctx.db.delete(orphan.conversationId))
      await t.run((ctx) =>
        ctx.db.patch(erased, {
          ...DUE,
          purgeAfter: null,
          purgeProgress: {
            stage: MESSAGES_STAGE,
            cursor: null,
            queryVersion: PURGE_QUERY_VERSION,
            step: 0,
          },
        }),
      )

      // Sent messages; then, per participant side, one page to find
      // conversations, one per conversation and one confirming the end.
      expect(await runStage(t, erased, MESSAGES_STAGE)).toBe(5)
      expect(await t.run((ctx) => ctx.db.get(incoming.messageId))).toBeNull()
      expect(await t.run((ctx) => ctx.db.get(orphan.messageId))).toBeNull()
      expect(
        await t.run((ctx) =>
          ctx.db
            .query('messages')
            .withIndex('by_conversation', (q) =>
              q.eq('conversationId', unrelated.conversationId),
            )
            .collect(),
        ),
      ).toHaveLength(unrelatedCount + 1)
    },
  )

  it('finishes a legacy global cursor marked accountIndexed with its original query', async () => {
    const t = convexTest(schema, modules)
    const erased = await seedUser(t, { username: 'erased' })
    const bob = await seedUser(t, { username: 'bob' })
    const carol = await seedUser(t, { username: 'carol' })
    const unrelated = await seedConversation(t, bob, carol, {
      lastMessageSenderId: bob,
      isRequest: false,
    })
    for (let index = 0; index < 59; index++)
      await insertMessage(t, unrelated.conversationId, carol, `other ${index}`)
    const relevant = await seedConversation(t, erased, bob, {
      lastMessageSenderId: bob,
      isRequest: false,
    })
    await t.run(async (ctx) => {
      // Original releases set `accountIndexed` on every new stage even though
      // the message stage always scanned the whole table.
      const first = await ctx.db
        .query('messages')
        .paginate({ cursor: null, numItems: 25 })
      await ctx.db.patch(erased, {
        ...DUE,
        purgeProgress: {
          stage: MESSAGES_STAGE,
          cursor: first.continueCursor,
          accountIndexed: true,
        },
      })
    })
    expect(await runStage(t, erased, MESSAGES_STAGE)).toBe(2)
    expect(await t.run((ctx) => ctx.db.get(relevant.messageId))).toBeNull()
    expect(
      (await t.run((ctx) => ctx.db.get(erased)))?.purgeProgress,
    ).toMatchObject({ stage: MESSAGES_STAGE + 1, queryVersion: 2 })
  })

  it('reaches every row on a large owned target and keeps independent text', async () => {
    const t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    const erased = await seedUser(t, { username: 'erased' })
    const other = await seedUser(t, { username: 'other' })
    const projectId = await seedProject(t, { ownerId: erased, name: 'engine' })
    const commentIds = await t.run(async (ctx) => {
      const ids = []
      for (let index = 0; index < 30; index++)
        ids.push(
          await ctx.db.insert('comments', {
            targetType: 'project',
            targetId: projectId,
            authorId: other,
            parentId: null,
            content: `independent ${index}`,
            replyCount: 0,
            likesCount: 0,
            isDeleted: false,
            authorSnapshot: {
              displayName: 'Other',
              avatarUrl: '',
              cityId: null,
              cityName: null,
            },
            targetSnapshot: {
              projectFullName: 'erased/engine',
              projectOwner: 'erased',
              projectRepo: 'engine',
              targetLabel: 'engine',
              updateTitle: null,
            },
            createdAt: NOW + index,
          }),
        )
      await ctx.db.insert('saved_projects', {
        userId: other,
        projectId,
        createdAt: NOW,
      })
      return ids
    })
    await purgeFixtureAccount(t, erased)
    const comments = await t.run((ctx) =>
      Promise.all(commentIds.map((id) => ctx.db.get(id))),
    )
    expect(
      comments.every(
        (comment) =>
          comment?.content.startsWith('independent') &&
          comment.targetSnapshot.projectOwner === 'deleted',
      ),
    ).toBe(true)
    expect(
      await t.run((ctx) => ctx.db.query('saved_projects').collect()),
    ).toEqual([])
  })
})

/** Sums the size of every document a purge page reads through `ctx.db`. */
function measureDocumentReads(ctx: MutationCtx) {
  let bytes = 0
  const count = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(count)
    else if (value && typeof value === 'object' && 'page' in value)
      count((value as { page: unknown }).page)
    else if (value && typeof value === 'object')
      bytes += getConvexSize(value as Value)
  }
  const wrapQuery = (query: object): object =>
    new Proxy(query, {
      get(target, key) {
        const member: unknown = Reflect.get(target, key)
        if (typeof member !== 'function') return member
        return (...args: unknown[]) => {
          const result: unknown = member.apply(target, args)
          if (result instanceof Promise)
            return result.then((resolved: unknown) => {
              count(resolved)
              return resolved
            })
          return result && typeof result === 'object'
            ? wrapQuery(result)
            : result
        }
      },
    })
  const db = new Proxy(ctx.db, {
    get(target, key) {
      const member: unknown = Reflect.get(target, key)
      if (typeof member !== 'function') return member
      if (key === 'get')
        return async (...args: unknown[]) => {
          const doc: unknown = await member.apply(target, args)
          count(doc)
          return doc
        }
      if (key === 'query')
        return (...args: unknown[]) => wrapQuery(member.apply(target, args))
      return member.bind(target)
    },
  })
  return { ctx: { ...ctx, db } as MutationCtx, bytes: () => bytes }
}

it('keeps every purge page far below the transaction read limit on large related rows', async () => {
  const t = convexTest(schema, modules)
  const erased = await seedUser(t, { username: 'erased' })
  const RELEASES_STAGE = 18
  const projects: Id<'projects'>[] = []
  for (let index = 0; index < 10; index++)
    projects.push(
      await seedProject(t, { ownerId: erased, name: `repo-${index}` }),
    )
  const largeBody = 'x'.repeat(80_000)
  await t.run(async (ctx) => {
    for (const projectId of projects)
      for (let index = 0; index < 25; index++)
        await ctx.db.insert('project_releases', {
          projectId,
          githubReleaseId: index,
          tagName: `v${index}`,
          name: `v${index}`,
          body: largeBody,
          htmlUrl: 'https://github.com/erased/repo/releases',
          isDraft: false,
          isPrerelease: false,
          publishedAt: NOW,
          createdAt: NOW,
          updatedAt: NOW,
          importedAt: NOW,
        })
    await ctx.db.patch(erased, {
      ...DUE,
      purgeAfter: null,
      purgeProgress: {
        stage: RELEASES_STAGE,
        cursor: null,
        queryVersion: PURGE_QUERY_VERSION,
        step: 0,
      },
    })
  })

  let largestPage = 0
  for (let page = 0; page < 500; page++) {
    const done = await t.run(async (ctx) => {
      const user = (await ctx.db.get(erased))!
      if (user.purgeProgress!.stage !== RELEASES_STAGE) return true
      const measured = measureDocumentReads(ctx)
      await purgeAccountPage(measured.ctx, user, user.purgeProgress!)
      largestPage = Math.max(largestPage, measured.bytes())
      return false
    })
    if (done) break
  }

  expect(
    await t.run((ctx) => ctx.db.query('project_releases').take(1)),
  ).toEqual([])
  // 250 releases total 20 MB; Convex allows 16 MiB per transaction.
  expect(largestPage).toBeLessThan(1_000_000)
})
