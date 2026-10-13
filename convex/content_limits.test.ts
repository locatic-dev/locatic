import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import {
  NOW,
  fixtureClerkId,
  seedPopulatedCity,
  type PopulatedCityFixture,
} from './__tests__/fixtures.helpers'
import { CONTENT_LIMITS } from './lib/content_limits'

/**
 * Server-side form validation and spam limits: user-written text is capped
 * in the mutations themselves, so a client that skips the form's maxLength
 * cannot store more, and bursts of writes are rate limited per user.
 */

const modules = import.meta.glob('./**/*.ts')

type T = TestConvex<typeof schema>

function as(t: T, username: string) {
  return t.withIdentity({ subject: fixtureClerkId(username) })
}

const tooLong = (field: keyof typeof CONTENT_LIMITS) =>
  'x'.repeat(CONTENT_LIMITS[field] + 1)

describe('content limits', () => {
  let t: T
  let fixture: PopulatedCityFixture

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    t = convexTest(schema, modules)
    rateLimiterTest.register(t)
    fixture = await seedPopulatedCity(t)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function comment(content: string, username = 'dev') {
    return as(t, username).mutation(api.comments.create, {
      targetType: 'project',
      targetId: String(fixture.projects.aliceApp),
      parentId: null,
      content,
    })
  }

  async function profileArgs() {
    const viewer = await t.run((ctx) => ctx.db.get(fixture.users.alice))
    return {
      displayName: viewer!.profile.displayName,
      bio: viewer!.profile.bio,
      cityId: viewer!.profile.cityId,
      buildStatus: viewer!.profile.buildStatus,
      socialLinks: viewer!.profile.socialLinks,
    }
  }

  it('rejects empty and over-long comments', async () => {
    await expect(comment('   ')).rejects.toThrow('Comment cannot be empty')
    await expect(comment(tooLong('comment'))).rejects.toThrow(
      'Comment must be 2,000 characters or fewer',
    )
    await expect(
      comment('x'.repeat(CONTENT_LIMITS.comment)),
    ).resolves.not.toBeNull()
  })

  it('counts whitespace padding toward the comment limit', async () => {
    await expect(
      comment(`${' '.repeat(CONTENT_LIMITS.comment)}x`),
    ).rejects.toThrow('Comment must be')
  })

  it('rejects over-long posts on create', async () => {
    await expect(
      as(t, 'alice').mutation(api.posts.create, {
        projectId: fixture.projects.aliceApp,
        body: tooLong('post'),
      }),
    ).rejects.toThrow('Post must be')
  })

  it('rejects over-long post edits and leaves the post unchanged', async () => {
    const created = await as(t, 'alice').mutation(api.posts.create, {
      projectId: fixture.projects.aliceApp,
      body: 'shipped',
    })
    await expect(
      as(t, 'alice').mutation(api.posts.update, {
        postId: created!._id,
        body: tooLong('post'),
      }),
    ).rejects.toThrow('Post must be')
    const post = await t.run((ctx) => ctx.db.get(created!._id))
    expect(post?.body).toBe('shipped')
  })

  it('rejects over-long direct messages', async () => {
    await expect(
      as(t, 'alice').mutation(api.conversations.sendFirstMessage, {
        otherUserId: fixture.users.dev,
        content: tooLong('message'),
      }),
    ).rejects.toThrow('Message must be')

    const { conversationId } = await as(t, 'alice').mutation(
      api.conversations.sendFirstMessage,
      { otherUserId: fixture.users.dev, content: 'hi' },
    )
    await expect(
      as(t, 'alice').mutation(api.conversations.sendMessage, {
        conversationId,
        content: tooLong('message'),
      }),
    ).rejects.toThrow('Message must be')
  })

  it('trims report details and rejects over-long ones', async () => {
    const created = await comment('hello')
    await expect(
      as(t, 'alice').mutation(api.comments.report, {
        commentId: created!._id,
        reason: 'spam',
        details: tooLong('reportDetails'),
      }),
    ).rejects.toThrow('Report details must be')

    const reportId = await as(t, 'alice').mutation(api.comments.report, {
      commentId: created!._id,
      reason: 'spam',
      details: '   ',
    })
    const report = await t.run((ctx) => ctx.db.get(reportId))
    expect(report?.details).toBeNull()
  })

  it('rejects over-long profile text on update and leaves it unchanged', async () => {
    const args = await profileArgs()
    const update = (overrides: Partial<typeof args>) =>
      as(t, 'alice').mutation(api.users.updateProfile, {
        ...args,
        ...overrides,
      })

    await expect(update({ bio: tooLong('bio') })).rejects.toThrow('Bio must be')
    await expect(
      update({ displayName: tooLong('displayName') }),
    ).rejects.toThrow('Display name must be')
    await expect(
      update({
        socialLinks: {
          ...args.socialLinks,
          website: `https://example.com/${tooLong('socialLink')}`,
        },
      }),
    ).rejects.toThrow('must be 2,048 characters or fewer')
    expect(await profileArgs()).toEqual(args)
  })

  it('applies profile limits and the profile rate limit to onboarding', async () => {
    const args = await profileArgs()
    const onboard = (overrides: { bio?: string; displayName?: string } = {}) =>
      as(t, 'alice').mutation(api.users.completeOnboarding, {
        displayName: args.displayName,
        bio: args.bio,
        cityId: args.cityId,
        onboardingSelectedOwnedProjectIds: [],
        exploreCityIds: [],
        stackPrefs: [],
        ...overrides,
      })

    await expect(onboard({ bio: tooLong('bio') })).rejects.toThrow(
      'Bio must be',
    )
    await expect(
      onboard({ displayName: tooLong('displayName') }),
    ).rejects.toThrow('Display name must be')
    // Rejected text fails before the limiter; the profileUpdate burst is 10.
    for (let index = 0; index < 10; index++) {
      await onboard()
    }
    await expect(onboard()).rejects.toThrow('Too many requests')
  })

  it('rate limits bursts of new posts, then refills', async () => {
    const post = () =>
      as(t, 'alice').mutation(api.posts.create, {
        projectId: fixture.projects.aliceApp,
        body: 'shipped',
      })
    for (let index = 0; index < 5; index++) {
      await post()
    }
    await expect(post()).rejects.toThrow('Too many requests')

    // The bucket refills at 10 an hour: one token every 6 minutes.
    vi.setSystemTime(NOW + 6 * 60_000 + 1_000)
    await expect(post()).resolves.not.toBeNull()
  })

  it('rate limits post edits separately from new posts', async () => {
    const created = await as(t, 'alice').mutation(api.posts.create, {
      projectId: fixture.projects.aliceApp,
      body: 'shipped',
    })
    const edit = (body: string) =>
      as(t, 'alice').mutation(api.posts.update, {
        postId: created!._id,
        body,
      })
    for (let index = 0; index < 10; index++) {
      await edit(`shipped v${index}`)
    }
    await expect(edit('one more')).rejects.toThrow('Too many requests')
    const post = await t.run((ctx) => ctx.db.get(created!._id))
    expect(post?.body).toBe('shipped v9')
  })

  it('rate limits follow and save churn', async () => {
    const targetUserId = fixture.users.bob
    for (let index = 0; index < 20; index++) {
      await as(t, 'alice').mutation(api.follows.follow, { targetUserId })
      await as(t, 'alice').mutation(api.follows.unfollow, { targetUserId })
    }
    await expect(
      as(t, 'alice').mutation(api.follows.follow, { targetUserId }),
    ).rejects.toThrow('Too many requests')

    const projectId = fixture.projects.bobCli
    for (let index = 0; index < 20; index++) {
      await as(t, 'alice').mutation(api.projects.save, { projectId })
      await as(t, 'alice').mutation(api.projects.unsave, { projectId })
    }
    await expect(
      as(t, 'alice').mutation(api.projects.save, { projectId }),
    ).rejects.toThrow('Too many requests')
  })

  it('rate limits bursts of comment reports', async () => {
    const commentIds: Array<Id<'comments'>> = []
    for (const username of ['dev', 'bob', 'carol']) {
      for (let index = 0; index < 2; index++) {
        const created = await comment(`comment ${index}`, username)
        commentIds.push(created!._id)
      }
    }
    const report = (commentId: Id<'comments'>) =>
      as(t, 'alice').mutation(api.comments.report, {
        commentId,
        reason: 'spam',
        details: null,
      })
    for (const commentId of commentIds.slice(0, 5)) {
      await report(commentId)
    }
    await expect(report(commentIds[5])).rejects.toThrow('Too many requests')
  })
})
