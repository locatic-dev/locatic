/**
 * Deterministic convex-test fixtures shared by backend contract tests.
 *
 * Usage (from a test file under `convex/`):
 *
 *   const t = convexTest(schema, import.meta.glob('../**\/*.ts'))
 *   const city = await seedPopulatedCity(t)
 *
 * The glob is relative to the test file, so a test in `convex/` uses
 * `'./**\/*.ts'` and a test in `convex/__tests__/` uses `'../**\/*.ts'`. Tests
 * that call mutations guarded by the rate limiter must also call
 * `rateLimiterTest.register(t)` (see `convex/project_reactions.test.ts`).
 *
 * This file is also picked up by the Convex bundler (one dot in the name), so
 * it deliberately has no runtime import of `convex-test`, `vitest` or
 * `import.meta.glob`; it only exports plain functions.
 *
 * Conventions:
 * - Every timestamp derives from `NOW`. Tests that exercise code reading
 *   `Date.now()` (cleanup, `home.list`) pin the clock with
 *   `vi.useFakeTimers({ now: NOW, toFake: ['Date'] })`.
 * - Helpers insert rows directly with `t.run(ctx => ctx.db.insert(...))`; they
 *   never call public mutations, schedule fan-out or write counters beyond
 *   the ones documented on each helper.
 * - Denormalised owner and actor fields (`projects.exploreOwner`,
 *   `projects.ownerSnapshot`, `posts.projectCityId`, event snapshots) are
 *   built with the same `convex/lib/snapshots.ts` builders the write paths
 *   use, so they hold exactly what production writes. Under the visibility
 *   policy (`convex/lib/visibility.ts`) that is the city id and
 *   exact city name only for `exact_city` members; region-only users get no
 *   city id and their region label as the city name; hidden users get null
 *   for both.
 */
import type { TestConvex } from 'convex-test'

import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import type schema from '../schema'
import { upsertHomeFeedItemForEvent } from '../lib/homeFeed'
import {
  buildProfileNotificationTarget,
  buildProjectNotificationTarget,
  buildConversationNotificationTarget,
} from '../lib/notifications'
import { buildPostSearchText } from '../lib/posts'
import {
  buildActorSnapshot,
  buildOwnerSnapshot,
  buildPostSnapshot,
  buildProjectExploreOwner,
  buildProjectSnapshot,
  getPostCityId,
} from '../lib/snapshots'
import { getProjectTopics, normalizeProjectTopics } from '../lib/topics'
import type { Doc } from '../lib/types'
import { createDefaultViewerProfile } from '../lib/viewer'
import { buildConversationKey } from '../lib/conversation'

export type FixtureTest = Pick<TestConvex<typeof schema>, 'run'>

type CityVisibility = Doc<'users'>['privacy']['cityVisibility']
type BuildStatus = Doc<'users'>['profile']['buildStatus']
type EventType = Doc<'activity_events'>['eventType']
type NotificationType = Doc<'notifications'>['type']
type HomeFeedTarget = NonNullable<Doc<'activity_events'>['target']>

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

/** Fixed fixture clock: 2026-09-01T12:00:00Z (midday keeps UTC day buckets stable). */
export const NOW = Date.UTC(2026, 8, 1, 12, 0, 0)
export const DAY_MS = 24 * 60 * 60 * 1000

export function daysAgo(days: number, now: number = NOW) {
  return now - days * DAY_MS
}

function getCommitFrequency(lastCommitAt: number) {
  // Mirrors the thresholds in convex/projects.ts, measured against NOW.
  const ageDays = (NOW - lastCommitAt) / DAY_MS
  if (ageDays <= 7) return 'active' as const
  if (ageDays <= 30) return 'slow' as const
  return 'dormant' as const
}

function stableNumber(value: string) {
  // FNV-1a, so repo and release ids are deterministic across runs.
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) + 1
}

async function getOrThrow<TTable extends 'users' | 'projects' | 'posts'>(
  get: (id: Id<TTable>) => Promise<Doc<TTable> | null>,
  id: Id<TTable>,
): Promise<Doc<TTable>> {
  const doc = await get(id)
  if (!doc) {
    throw new Error(`Fixture document ${id} not found`)
  }
  return doc
}

// ---------------------------------------------------------------------------
// Cities
// ---------------------------------------------------------------------------

export interface FixtureCity {
  slug: string
  name: string
  region: string | null
  country: string
  countryCode: string
  lat: number
  lng: number
  aliases: string[]
  timezone: string | null
}

export const BENGALURU: FixtureCity = {
  slug: 'bengaluru-in',
  name: 'Bengaluru',
  region: 'Karnataka',
  country: 'India',
  countryCode: 'IN',
  lat: 12.9716,
  lng: 77.5946,
  aliases: ['bangalore'],
  timezone: 'Asia/Kolkata',
}

export const HYDERABAD: FixtureCity = {
  slug: 'hyderabad-in',
  name: 'Hyderabad',
  region: 'Telangana',
  country: 'India',
  countryCode: 'IN',
  lat: 17.385,
  lng: 78.4867,
  aliases: ['hyd', 'cyberabad'],
  timezone: 'Asia/Kolkata',
}

/**
 * Distant city (different country and continent). Copied from the catalogue
 * row (`scripts/generated-cities.jsonl`, slug `berlin-de`): its region names
 * the city, so a region-only label is the country alone.
 */
export const BERLIN: FixtureCity = {
  slug: 'berlin-de',
  name: 'Berlin',
  region: 'State of Berlin',
  country: 'Germany',
  countryCode: 'DE',
  lat: 52.52437,
  lng: 13.41053,
  aliases: [],
  timezone: 'Europe/Berlin',
}

/** Catalogue row `vienna-at`: region "State of Vienna" names the city. */
export const VIENNA: FixtureCity = {
  slug: 'vienna-at',
  name: 'Vienna',
  region: 'State of Vienna',
  country: 'Austria',
  countryCode: 'AT',
  lat: 48.20849,
  lng: 16.37208,
  aliases: [],
  timezone: 'Europe/Vienna',
}

/** Catalogue row `kyiv-ua`: region "Kyiv City" names the city. */
export const KYIV: FixtureCity = {
  slug: 'kyiv-ua',
  name: 'Kyiv',
  region: 'Kyiv City',
  country: 'Ukraine',
  countryCode: 'UA',
  lat: 50.45466,
  lng: 30.5238,
  aliases: [],
  timezone: 'Europe/Kyiv',
}

/**
 * Catalogue row `singapore-sg`: no region and the country is the city, so a
 * region-only user discloses nothing.
 */
export const SINGAPORE: FixtureCity = {
  slug: 'singapore-sg',
  name: 'Singapore',
  region: null,
  country: 'Singapore',
  countryCode: 'SG',
  lat: 1.28967,
  lng: 103.85007,
  aliases: [],
  timezone: 'Asia/Singapore',
}

/** Active city about 130 km from Bengaluru, used as the empty city. */
export const MYSURU: FixtureCity = {
  slug: 'mysuru-in',
  name: 'Mysuru',
  region: 'Karnataka',
  country: 'India',
  countryCode: 'IN',
  lat: 12.2958,
  lng: 76.6394,
  aliases: ['mysore'],
  timezone: 'Asia/Kolkata',
}

/** Inserts one city with the same derived fields as `cities.seedDefaultCities`. */
export async function seedCity(
  t: FixtureTest,
  city: FixtureCity,
  opts: { isActive?: boolean } = {},
): Promise<Id<'cities'>> {
  const displayName = [city.name, city.region, city.country]
    .filter(Boolean)
    .join(', ')
  return await t.run((ctx) =>
    ctx.db.insert('cities', {
      slug: city.slug,
      name: city.name,
      displayName,
      normalizedName: displayName.toLowerCase(),
      region: city.region,
      country: city.country,
      countryCode: city.countryCode,
      location: { lat: city.lat, lng: city.lng },
      address: displayName,
      aliases: city.aliases,
      timezone: city.timezone,
      searchText: [displayName, city.name, ...city.aliases].join(' '),
      isActive: opts.isActive ?? true,
      createdAt: daysAgo(365),
      updatedAt: daysAgo(365),
    }),
  )
}

export interface SeededCities {
  bengaluru: Id<'cities'>
  hyderabad: Id<'cities'>
  berlin: Id<'cities'>
  vienna: Id<'cities'>
  kyiv: Id<'cities'>
  singapore: Id<'cities'>
}

/**
 * Two nearby Indian cities plus distant ones. Berlin, Vienna, Kyiv and
 * Singapore carry their real catalogue region strings, whose region (or
 * country) names the city.
 */
export async function seedCities(t: FixtureTest): Promise<SeededCities> {
  return {
    bengaluru: await seedCity(t, BENGALURU),
    hyderabad: await seedCity(t, HYDERABAD),
    berlin: await seedCity(t, BERLIN),
    vienna: await seedCity(t, VIENNA),
    kyiv: await seedCity(t, KYIV),
    singapore: await seedCity(t, SINGAPORE),
  }
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface SeedUserOptions {
  /** GitHub login; also derives clerkId (`clerk_<username>`), email and avatar. */
  username: string
  displayName?: string
  cityId?: Id<'cities'> | null
  cityVisibility?: CityVisibility
  appearInExplore?: boolean
  appearInPulse?: boolean
  buildStatus?: BuildStatus
  /** Written to `stats.followersCount` only; no follows rows are created. */
  followersCount?: number
  /** Written to `stats.projectsCount` only; seed the projects separately. */
  projectsCount?: number
  /** Account creation time; use a recent value for "new builder" cases. */
  createdAt?: number
  /** When false, `onboardingCompletedAt` is null. Default true. */
  onboarded?: boolean
  /** When true, stores a two-week `githubContributions` graph ending at NOW. */
  withContributions?: boolean
  primaryLanguages?: string[]
  bio?: string
  /** `locatic_only` hides the profile from signed-out visitors. Default public. */
  profileVisibility?: Doc<'users'>['privacy']['profileVisibility']
}

function buildContributions() {
  const days = Array.from({ length: 14 }, (_, index) => ({
    date: new Date(daysAgo(13 - index)).toISOString().slice(0, 10),
    count: index % 4,
  }))
  return {
    totalContributions: days.reduce((sum, day) => sum + day.count, 0),
    weeks: [{ days: days.slice(0, 7) }, { days: days.slice(7) }],
    syncedAt: NOW,
  }
}

/**
 * Inserts a user built from `createDefaultViewerProfile` (the real sign-up
 * shape), with fixture overrides. Sign in as the user with
 * `t.withIdentity({ subject: fixtureClerkId(username) })`.
 */
export async function seedUser(
  t: FixtureTest,
  opts: SeedUserOptions,
): Promise<Id<'users'>> {
  const base = createDefaultViewerProfile({
    clerkId: fixtureClerkId(opts.username),
    email: `${opts.username}@example.test`,
    githubId: stableNumber(`user:${opts.username}`),
    githubUsername: opts.username,
    githubUrl: `https://github.com/${opts.username}`,
    avatarUrl: `https://avatars.example.test/${opts.username}.png`,
    displayName: opts.displayName ?? opts.username,
  })
  const createdAt = opts.createdAt ?? daysAgo(120)

  return await t.run((ctx) =>
    ctx.db.insert('users', {
      ...base,
      profile: {
        ...base.profile,
        bio: opts.bio ?? '',
        cityId: opts.cityId ?? null,
        buildStatus: opts.buildStatus ?? 'building_solo',
        primaryLanguages: opts.primaryLanguages ?? [],
      },
      stats: {
        ...base.stats,
        followersCount: opts.followersCount ?? 0,
        projectsCount: opts.projectsCount ?? 0,
      },
      appearInExplore: opts.appearInExplore ?? true,
      privacy: {
        ...base.privacy,
        cityVisibility: opts.cityVisibility ?? 'exact_city',
        appearInPulse: opts.appearInPulse ?? true,
        profileVisibility:
          opts.profileVisibility ?? base.privacy.profileVisibility,
      },
      ...(opts.withContributions
        ? { githubContributions: buildContributions() }
        : {}),
      githubLastSyncedAt: createdAt,
      onboardingCompletedAt: (opts.onboarded ?? true) ? createdAt : null,
      createdAt,
      updatedAt: createdAt,
    }),
  )
}

export function fixtureClerkId(username: string) {
  return `clerk_${username}`
}

// ---------------------------------------------------------------------------
// Projects, releases, posts
// ---------------------------------------------------------------------------

export interface SeedProjectOptions {
  ownerId: Id<'users'>
  /** Repository name; full name is `<owner github username>/<name>`. */
  name: string
  description?: string | null
  /** Language names, largest first; bytes are derived. Default `['TypeScript']`. */
  languages?: string[]
  /** Default: first entry of `languages`, or null when `languages` is empty. */
  primaryLanguage?: string | null
  /** GitHub topics as returned by the API. */
  githubTopics?: string[]
  /**
   * Edited Locatic tags. When given, `locatic.topicsEditedAt` is set and these
   * win over GitHub topics in `getProjectTopics`. When omitted, tags default to
   * the normalised GitHub topics, as the import path does.
   */
  locaticTags?: string[]
  lastCommitAt?: number
  addedAt?: number
  /** `locatic.isVisible`, the schema's hidden flag. Default true. */
  isVisible?: boolean
  likesCount?: number
  commentsCount?: number
  stargazersCount?: number
  /** Initial `locatic.postsCount`; `seedPost` increments it. Default 0. */
  postsCount?: number
}

/**
 * Inserts a project whose `exploreOwner` and `ownerSnapshot` come from the
 * owner's current document via the production snapshot builders. Increments
 * the owner's `stats.projectsCount` when the project is visible.
 */
export async function seedProject(
  t: FixtureTest,
  opts: SeedProjectOptions,
): Promise<Id<'projects'>> {
  return await t.run(async (ctx) => {
    const owner = await getOrThrow((id) => ctx.db.get(id), opts.ownerId)
    const ownerLogin = owner.github.username
    const fullName = `${ownerLogin}/${opts.name}`
    const languages = opts.languages ?? ['TypeScript']
    const githubTopics = opts.githubTopics ?? []
    const isVisible = opts.isVisible ?? true
    const lastCommitAt = opts.lastCommitAt ?? daysAgo(1)
    const addedAt = opts.addedAt ?? daysAgo(30)

    const projectId = await ctx.db.insert('projects', {
      ownerId: owner._id,
      github: {
        repoId: stableNumber(`repo:${fullName}`),
        fullName,
        ownerLogin,
        ownerLoginKey: ownerLogin.toLowerCase(),
        name: opts.name,
        nameKey: opts.name.toLowerCase(),
        description: opts.description ?? `${opts.name} fixture project`,
        githubUrl: `https://github.com/${fullName}`,
        projectUrl: null,
        primaryLanguage:
          opts.primaryLanguage !== undefined
            ? opts.primaryLanguage
            : (languages[0] ?? null),
        languages: languages.map((language, index) => ({
          name: language,
          bytes: (languages.length - index) * 1000,
        })),
        topics: githubTopics,
        stargazersCount: opts.stargazersCount ?? 0,
        lastCommitAt,
        lastMetadataSyncedAt: addedAt,
        lastMetadataSyncAttemptedAt: addedAt,
        commitFrequency: getCommitFrequency(lastCommitAt),
        readmePreview: null,
        readmeAssetBaseUrl: null,
        readmeAssetRootUrl: null,
        readmeLinkBaseUrl: null,
        readmeLinkRootUrl: null,
      },
      locatic: {
        isVisible,
        tags: opts.locaticTags ?? normalizeProjectTopics(githubTopics),
        likesCount: opts.likesCount ?? 0,
        commentsCount: opts.commentsCount ?? 0,
        postsCount: opts.postsCount ?? 0,
        lastPublicActivityAt: Math.min(lastCommitAt, NOW),
        ...(opts.locaticTags ? { topicsEditedAt: addedAt } : {}),
      },
      exploreOwner: buildProjectExploreOwner(owner, isVisible),
      ownerSnapshot: await buildOwnerSnapshot(ctx.db, owner),
      topContributorsSnapshot: [],
      contributorStats: {
        matchedCount: 0,
        lastSyncedAt: null,
        lastSyncAttemptedAt: null,
        syncCadence: 'weekly',
      },
      addedToLocaticAt: addedAt,
      updatedAt: addedAt,
    })

    if (isVisible) {
      await ctx.db.patch(owner._id, {
        stats: {
          ...owner.stats,
          projectsCount: owner.stats.projectsCount + 1,
        },
      })
    }

    return projectId
  })
}

/** Inserts a published (non-draft) release; pass `null` for an unpublished draft. */
export async function seedRelease(
  t: FixtureTest,
  projectId: Id<'projects'>,
  publishedAt: number | null,
  opts: { tagName?: string; name?: string | null } = {},
): Promise<Id<'project_releases'>> {
  const tagName =
    opts.tagName ?? `v0.${Math.round((NOW - (publishedAt ?? NOW)) / DAY_MS)}.0`
  return await t.run(async (ctx) => {
    const project = await getOrThrow((id) => ctx.db.get(id), projectId)
    const createdAt = publishedAt ?? NOW
    const releaseId = await ctx.db.insert('project_releases', {
      projectId,
      githubReleaseId: stableNumber(`release:${projectId}:${tagName}`),
      tagName,
      name: opts.name ?? tagName,
      body: null,
      htmlUrl: `${project.github.githubUrl}/releases/tag/${tagName}`,
      isDraft: publishedAt === null,
      isPrerelease: false,
      publishedAt,
      createdAt,
      updatedAt: createdAt,
      importedAt: createdAt,
    })
    if (
      publishedAt !== null &&
      Math.min(publishedAt, NOW) > (project.locatic.lastPublicActivityAt ?? 0)
    ) {
      await ctx.db.patch(projectId, {
        locatic: {
          ...project.locatic,
          lastPublicActivityAt: Math.min(publishedAt, NOW),
        },
      })
    }
    return releaseId
  })
}

/**
 * Inserts a post shaped like `posts.create` and increments the project's
 * `locatic.postsCount` and the author's `stats.postsCount`. Does not create
 * the matching `post_created` activity event; use `seedActivityEvent`.
 */
export async function seedPost(
  t: FixtureTest,
  projectId: Id<'projects'>,
  authorId: Id<'users'>,
  createdAt: number,
  opts: { body?: string; deletedAt?: number | null } = {},
): Promise<Id<'posts'>> {
  return await t.run(async (ctx) => {
    const project = await getOrThrow((id) => ctx.db.get(id), projectId)
    const author = await getOrThrow((id) => ctx.db.get(id), authorId)
    const owner = await getOrThrow((id) => ctx.db.get(id), project.ownerId)
    const body = opts.body ?? `Shipped an update to ${project.github.name}`
    const projectTopics = getProjectTopics(project)

    const postId = await ctx.db.insert('posts', {
      projectId,
      ownerId: project.ownerId,
      actorId: authorId,
      authorRole: authorId === project.ownerId ? 'owner' : 'collaborator',
      body,
      searchText: buildPostSearchText({
        body,
        projectFullName: project.github.fullName,
        topics: projectTopics,
      }),
      reactionCounts: {},
      commentsCount: 0,
      projectCityId: getPostCityId(owner),
      projectTopics,
      actorSnapshot: await buildActorSnapshot(ctx.db, author),
      projectSnapshot: {
        name: project.github.name,
        fullName: project.github.fullName,
        ownerLogin: project.github.ownerLogin,
        primaryLanguage: project.github.primaryLanguage,
        languages: project.github.languages,
      },
      createdAt,
      updatedAt: createdAt,
      deletedAt: opts.deletedAt ?? null,
    })

    await ctx.db.patch(projectId, {
      locatic: {
        ...project.locatic,
        postsCount: (project.locatic.postsCount ?? 0) + 1,
        lastPublicActivityAt:
          opts.deletedAt === null || opts.deletedAt === undefined
            ? Math.max(project.locatic.lastPublicActivityAt ?? 0, createdAt)
            : project.locatic.lastPublicActivityAt,
      },
    })
    await ctx.db.patch(authorId, {
      stats: {
        ...author.stats,
        postsCount: (author.stats.postsCount ?? 0) + 1,
      },
    })

    return postId
  })
}

// ---------------------------------------------------------------------------
// Social graph and Home feed
// ---------------------------------------------------------------------------

/**
 * Inserts the follows row only: no counters, no backfill, no activity event,
 * no notification. Call `api.follows.follow` instead to exercise backfill.
 */
export async function seedFollow(
  t: FixtureTest,
  followerId: Id<'users'>,
  followingId: Id<'users'>,
  opts: { createdAt?: number } = {},
): Promise<Id<'follows'>> {
  return await t.run((ctx) =>
    ctx.db.insert('follows', {
      followerId,
      followingId,
      createdAt: opts.createdAt ?? daysAgo(60),
    }),
  )
}

/** Project-bound event types; comment and follow events need extra targets. */
export type FixtureEventType = Extract<
  EventType,
  'project_posted' | 'post_created' | 'project_liked' | 'contributor_matched'
>

/**
 * Inserts an `activity_events` row with the snapshots and `target` the write
 * paths produce. `post_created` requires `opts.postId`. Does not fan out.
 */
export async function seedActivityEvent(
  t: FixtureTest,
  actorId: Id<'users'>,
  projectId: Id<'projects'>,
  createdAt: number,
  eventType: FixtureEventType,
  opts: { postId?: Id<'posts'> } = {},
): Promise<Id<'activity_events'>> {
  if (eventType === 'post_created' && !opts.postId) {
    throw new Error('seedActivityEvent: post_created requires opts.postId')
  }

  return await t.run(async (ctx) => {
    const actor = await getOrThrow((id) => ctx.db.get(id), actorId)
    const project = await getOrThrow((id) => ctx.db.get(id), projectId)
    const projectSnapshot = buildProjectSnapshot(project)
    const post = opts.postId
      ? await getOrThrow((id) => ctx.db.get(id), opts.postId)
      : null
    const postSnapshot = post ? buildPostSnapshot(post) : null
    const target: HomeFeedTarget = post
      ? {
          kind: 'post',
          projectId,
          postId: post._id,
          projectSnapshot,
          postSnapshot,
        }
      : { kind: 'project', projectId, projectSnapshot }

    return await ctx.db.insert('activity_events', {
      actorId,
      eventType,
      projectId,
      postId: post?._id ?? null,
      commentId: null,
      actorSnapshot: await buildActorSnapshot(ctx.db, actor),
      projectSnapshot,
      postSnapshot,
      target,
      createdAt,
    })
  })
}

/**
 * Delivers one event to one follower through `upsertHomeFeedItemForEvent`,
 * with the fan-out item shape (`reason: 'following'`, `priority: 1`). Items
 * for the same follower, actor, kind and UTC day merge into one group row,
 * exactly as in production. Returns the inserted or merged item id.
 */
export async function seedHomeFeedItem(
  t: FixtureTest,
  userId: Id<'users'>,
  eventId: Id<'activity_events'>,
): Promise<Id<'home_feed_items'>> {
  return await t.run(async (ctx) => {
    const event = await ctx.db.get(eventId)
    if (!event?.target) {
      throw new Error(`seedHomeFeedItem: event ${eventId} has no target`)
    }
    const result = await upsertHomeFeedItemForEvent(
      ctx,
      {
        userId,
        sourceEventId: event._id,
        dedupeKey: `${userId}:${event._id}`,
        reason: 'following',
        priority: 1,
        actorId: event.actorId,
        eventType: event.eventType,
        projectId: event.projectId ?? null,
        postId: event.postId ?? null,
        actorSnapshot: event.actorSnapshot,
        projectSnapshot: event.projectSnapshot ?? null,
        postSnapshot: event.postSnapshot ?? null,
        target: event.target,
        createdAt: event.createdAt,
      },
      event.target,
    )
    if (!result.id)
      throw new Error('seedHomeFeedItem: unavailable account or target')
    return result.id
  })
}

// ---------------------------------------------------------------------------
// Inbox and notifications
// ---------------------------------------------------------------------------

export interface SeedConversationOptions {
  /** True while the recipient has not accepted (a message request). */
  isRequest: boolean
  /**
   * Sender of the last (and only) message. With `isRequest: true`, the
   * conversation is an outgoing pending request for this user and an incoming
   * request for the other participant.
   */
  lastMessageSenderId: Id<'users'>
  sentAt?: number
  content?: string
}

/** Inserts a conversation plus its one message; the recipient has 1 unread. */
export async function seedConversation(
  t: FixtureTest,
  a: Id<'users'>,
  b: Id<'users'>,
  opts: SeedConversationOptions,
): Promise<{ conversationId: Id<'conversations'>; messageId: Id<'messages'> }> {
  if (opts.lastMessageSenderId !== a && opts.lastMessageSenderId !== b) {
    throw new Error('seedConversation: sender must be a participant')
  }
  const senderId = opts.lastMessageSenderId
  const recipientId = senderId === a ? b : a
  const sentAt = opts.sentAt ?? daysAgo(1)
  const content = opts.content ?? 'Hey, saw your project on Locatic'
  const [participantLowId, participantHighId] =
    String(a) < String(b) ? [a, b] : [b, a]

  return await t.run(async (ctx) => {
    const conversationId = await ctx.db.insert('conversations', {
      conversationKey: buildConversationKey(String(a), String(b)),
      participantLowId,
      participantHighId,
      lastMessage: { content, senderId, sentAt },
      unreadCounts: { [String(senderId)]: 0, [String(recipientId)]: 1 },
      isRequest: opts.isRequest,
      createdAt: sentAt,
      updatedAt: sentAt,
    })
    const messageId = await ctx.db.insert('messages', {
      conversationId,
      senderId,
      content,
      readAt: null,
      createdAt: sentAt,
    })
    return { conversationId, messageId }
  })
}

export interface SeedNotificationOptions {
  recipientId: Id<'users'>
  actorId: Id<'users'>
  type: NotificationType
  createdAt?: number
  /** Default: read for `dm_received` (as production writes it), else unread. */
  isRead?: boolean
  /** Required for project-bound types (likes, comments, contributor). */
  projectId?: Id<'projects'>
  /** Required for `dm_received`. */
  conversationId?: Id<'conversations'>
}

/**
 * Inserts a notification with the `target` the write paths build: profile for
 * `followed`, conversation for `dm_received`, project otherwise. Ignores
 * notification preferences (unlike `createNotificationIfEnabled`).
 */
export async function seedNotification(
  t: FixtureTest,
  opts: SeedNotificationOptions,
): Promise<Id<'notifications'>> {
  return await t.run(async (ctx) => {
    const actor = await getOrThrow((id) => ctx.db.get(id), opts.actorId)
    const project = opts.projectId
      ? await getOrThrow((id) => ctx.db.get(id), opts.projectId)
      : null

    let target: ReturnType<typeof buildProfileNotificationTarget>
    if (opts.type === 'followed') {
      target = buildProfileNotificationTarget(actor.github.username)
    } else if (opts.type === 'dm_received') {
      if (!opts.conversationId) {
        throw new Error('seedNotification: dm_received requires conversationId')
      }
      const conversation = await ctx.db.get(opts.conversationId)
      target = buildConversationNotificationTarget(
        opts.conversationId,
        conversation?.isRequest ?? false,
      )
    } else {
      if (!project) {
        throw new Error(`seedNotification: ${opts.type} requires projectId`)
      }
      target = buildProjectNotificationTarget({
        fullName: project.github.fullName,
        owner: project.github.ownerLogin,
        repo: project.github.name,
      })
    }

    return await ctx.db.insert('notifications', {
      recipientId: opts.recipientId,
      actorId: opts.actorId,
      type: opts.type,
      projectId: project?._id ?? null,
      postId: null,
      commentId: null,
      actorSnapshot: {
        displayName: actor.profile.displayName,
        avatarUrl: actor.profile.avatarUrl,
      },
      projectName: project?.github.name ?? null,
      target,
      // As `createNotificationIfEnabled`: direct messages are created read.
      isRead: opts.isRead ?? opts.type === 'dm_received',
      createdAt: opts.createdAt ?? daysAgo(1),
    })
  })
}

// ---------------------------------------------------------------------------
// GitHub sync failure
// ---------------------------------------------------------------------------

export interface SeedFailedSyncOptions {
  userId: Id<'users'>
  /**
   * When given, mirrors `github.recordProjectMetadataSyncFailure`: the
   * project's `lastMetadataSyncAttemptedAt` moves past `lastMetadataSyncedAt`
   * and a `metadata` failure is logged. Otherwise a `manual` repo-sync
   * failure is logged for the user.
   */
  projectId?: Id<'projects'>
  syncedAt?: number
  error?: string
}

/** Inserts a failed `github_sync_log` row (the persisted sync-failure record). */
export async function seedFailedSync(
  t: FixtureTest,
  opts: SeedFailedSyncOptions,
): Promise<Id<'github_sync_log'>> {
  const syncedAt = opts.syncedAt ?? daysAgo(1)
  return await t.run(async (ctx) => {
    if (opts.projectId) {
      const project = await getOrThrow((id) => ctx.db.get(id), opts.projectId)
      await ctx.db.patch(project._id, {
        github: { ...project.github, lastMetadataSyncAttemptedAt: syncedAt },
      })
    }
    return await ctx.db.insert('github_sync_log', {
      userId: opts.userId,
      syncType: opts.projectId ? 'metadata' : 'manual',
      reposFetched: opts.projectId ? 1 : 0,
      reposNew: 0,
      reposUpdated: 0,
      status: 'failed',
      error: opts.error ?? 'GitHub API responded with 502',
      githubRateLimitRemaining: null,
      syncedAt,
    })
  })
}

// ---------------------------------------------------------------------------
// Composite scenarios
// ---------------------------------------------------------------------------

export interface PopulatedCityFixture {
  cities: SeededCities
  users: {
    /** Bengaluru, exact city, TypeScript, most followers. */
    alice: Id<'users'>
    /** Bengaluru, exact city, TypeScript, edited Locatic tags. */
    bob: Id<'users'>
    /** Bengaluru, exact city, Rust, joined 3 days ago, only `webgpu` project. */
    carol: Id<'users'>
    /** Bengaluru profile city, `region_only`. */
    dev: Id<'users'>
    /** Bengaluru profile city, `hidden`, still `appearInExplore: true`. */
    erin: Id<'users'>
    /** Hyderabad, exact city, TypeScript. */
    frank: Id<'users'>
    /** Bengaluru, exact city, `appearInExplore: false` (out of discovery). */
    gwen: Id<'users'>
  }
  projects: {
    aliceApp: Id<'projects'>
    aliceLib: Id<'projects'>
    bobCli: Id<'projects'>
    carolEngine: Id<'projects'>
    devTool: Id<'projects'>
    erinService: Id<'projects'>
    frankApi: Id<'projects'>
    gwenBot: Id<'projects'>
  }
  releases: {
    aliceAppRecent: Id<'project_releases'>
    aliceAppOld: Id<'project_releases'>
    carolEngine: Id<'project_releases'>
    frankApi: Id<'project_releases'>
  }
  posts: {
    bobCli: Id<'posts'>
    devTool: Id<'posts'>
    erinService: Id<'posts'>
    frankApi: Id<'posts'>
    gwenBot: Id<'posts'>
  }
}

/**
 * Bengaluru with 3 exact-city builders, 1 region-only and 1 hidden builder,
 * plus one exact-city builder in Hyderabad; Berlin stays empty. Gwen is an
 * exact-city Bengaluru member who opted out of discovery
 * (`appearInExplore: false`): her project and post exist and are public on
 * her profile and project page, but never count for or appear in city or
 * global discovery.
 *
 * Languages (primary): TypeScript x5 (common), Rust x1, Go x1, Python x1
 * (gwenBot, out of discovery).
 * Topics (canonical, via `getProjectTopics`): `ai` on 4 projects (common),
 * `webgpu` on carolEngine only (rare). bobCli has GitHub topics `['cli']` but
 * edited Locatic tags `['developer-tools', 'ai']`, which take precedence.
 * Releases: 4 published (3, 45, 10 and 5 days ago). Posts: 5 (1, 2, 5, 6
 * days ago, and gwenBot's 3 days ago). No follows, events or feed items; add
 * them per test.
 */
export async function seedPopulatedCity(
  t: FixtureTest,
  cities?: SeededCities,
): Promise<PopulatedCityFixture> {
  const seededCities = cities ?? (await seedCities(t))
  const { bengaluru, hyderabad } = seededCities

  const alice = await seedUser(t, {
    username: 'alice',
    cityId: bengaluru,
    followersCount: 12,
    buildStatus: 'open_to_collab',
    withContributions: true,
    primaryLanguages: ['TypeScript'],
  })
  const bob = await seedUser(t, {
    username: 'bob',
    cityId: bengaluru,
    followersCount: 4,
    buildStatus: 'building_solo',
  })
  const carol = await seedUser(t, {
    username: 'carol',
    cityId: bengaluru,
    followersCount: 0,
    buildStatus: 'looking_for_cofounder',
    createdAt: daysAgo(3),
  })
  const dev = await seedUser(t, {
    username: 'dev',
    cityId: bengaluru,
    cityVisibility: 'region_only',
    followersCount: 7,
  })
  const erin = await seedUser(t, {
    username: 'erin',
    cityId: bengaluru,
    cityVisibility: 'hidden',
    appearInExplore: true,
    followersCount: 20,
  })
  const frank = await seedUser(t, {
    username: 'frank',
    cityId: hyderabad,
    followersCount: 3,
    buildStatus: 'hiring',
  })
  const gwen = await seedUser(t, {
    username: 'gwen',
    cityId: bengaluru,
    appearInExplore: false,
    followersCount: 2,
  })

  const aliceApp = await seedProject(t, {
    ownerId: alice,
    name: 'city-notes',
    languages: ['TypeScript', 'CSS'],
    githubTopics: ['ai', 'maps'],
    lastCommitAt: daysAgo(1),
    likesCount: 5,
    stargazersCount: 40,
  })
  const aliceLib = await seedProject(t, {
    ownerId: alice,
    name: 'tiny-router',
    languages: ['TypeScript'],
    githubTopics: ['routing'],
    lastCommitAt: daysAgo(20),
  })
  const bobCli = await seedProject(t, {
    ownerId: bob,
    name: 'shipit',
    languages: ['TypeScript', 'Shell'],
    githubTopics: ['cli'],
    locaticTags: ['developer-tools', 'ai'],
    lastCommitAt: daysAgo(2),
  })
  const carolEngine = await seedProject(t, {
    ownerId: carol,
    name: 'raymarch',
    languages: ['Rust', 'WGSL'],
    githubTopics: ['webgpu', 'graphics'],
    lastCommitAt: daysAgo(1),
    addedAt: daysAgo(2),
  })
  const devTool = await seedProject(t, {
    ownerId: dev,
    name: 'env-doctor',
    languages: ['TypeScript'],
    githubTopics: ['ai'],
    lastCommitAt: daysAgo(6),
  })
  const erinService = await seedProject(t, {
    ownerId: erin,
    name: 'queue-lite',
    languages: ['Go'],
    githubTopics: ['queues'],
    lastCommitAt: daysAgo(3),
  })
  const frankApi = await seedProject(t, {
    ownerId: frank,
    name: 'bus-times',
    languages: ['TypeScript'],
    githubTopics: ['ai', 'transit'],
    lastCommitAt: daysAgo(5),
  })
  const gwenBot = await seedProject(t, {
    ownerId: gwen,
    name: 'standup-bot',
    languages: ['Python'],
    githubTopics: ['bots'],
    lastCommitAt: daysAgo(3),
  })

  return {
    cities: seededCities,
    users: { alice, bob, carol, dev, erin, frank, gwen },
    projects: {
      aliceApp,
      aliceLib,
      bobCli,
      carolEngine,
      devTool,
      erinService,
      frankApi,
      gwenBot,
    },
    releases: {
      aliceAppRecent: await seedRelease(t, aliceApp, daysAgo(3)),
      aliceAppOld: await seedRelease(t, aliceApp, daysAgo(45)),
      carolEngine: await seedRelease(t, carolEngine, daysAgo(10)),
      frankApi: await seedRelease(t, frankApi, daysAgo(5)),
    },
    posts: {
      bobCli: await seedPost(t, bobCli, bob, daysAgo(2)),
      devTool: await seedPost(t, devTool, dev, daysAgo(1)),
      erinService: await seedPost(t, erinService, erin, daysAgo(5)),
      frankApi: await seedPost(t, frankApi, frank, daysAgo(6)),
      gwenBot: await seedPost(t, gwenBot, gwen, daysAgo(3), {
        body: 'standup-bot now posts to two channels',
      }),
    },
  }
}

export interface EmptyCityFixture {
  cityId: Id<'cities'>
  /** Onboarded exact-city user who is the only person in the city, no projects. */
  userId: Id<'users'>
}

/**
 * An active catalogue city (Mysuru, near Bengaluru) whose only resident is one
 * onboarded user with no projects, releases or posts.
 */
export async function seedEmptyCity(t: FixtureTest): Promise<EmptyCityFixture> {
  const cityId = await seedCity(t, MYSURU)
  const userId = await seedUser(t, { username: 'mysuru-solo', cityId })
  return { cityId, userId }
}

export type PrivacyVariantKey = `${CityVisibility}:${'explore' | 'noExplore'}`

export interface PrivacyVariantsFixture {
  cityId: Id<'cities'>
  users: Record<PrivacyVariantKey, Id<'users'>>
  /** One visible project per user, same key. */
  projects: Record<PrivacyVariantKey, Id<'projects'>>
}

const CITY_VISIBILITIES: CityVisibility[] = [
  'exact_city',
  'region_only',
  'hidden',
]

/**
 * One user (with one visible project) for every combination of
 * `cityVisibility` and `appearInExplore`, all with the same profile city.
 * Seeds Bengaluru when no city is given.
 */
export async function seedPrivacyVariants(
  t: FixtureTest,
  cityId?: Id<'cities'>,
): Promise<PrivacyVariantsFixture> {
  const resolvedCityId = cityId ?? (await seedCity(t, BENGALURU))
  const users = {} as Record<PrivacyVariantKey, Id<'users'>>
  const projects = {} as Record<PrivacyVariantKey, Id<'projects'>>

  for (const cityVisibility of CITY_VISIBILITIES) {
    for (const appearInExplore of [true, false]) {
      const key: PrivacyVariantKey = `${cityVisibility}:${appearInExplore ? 'explore' : 'noExplore'}`
      const username = `privacy-${cityVisibility.replace('_', '-')}-${appearInExplore ? 'explore' : 'no-explore'}`
      users[key] = await seedUser(t, {
        username,
        cityId: resolvedCityId,
        cityVisibility,
        appearInExplore,
      })
      projects[key] = await seedProject(t, {
        ownerId: users[key],
        name: `${username}-project`,
      })
    }
  }

  return { cityId: resolvedCityId, users, projects }
}

/** Drain lifecycle snapshot pages without advancing timers into the purge window. */
export async function finishLifecycleOwnerSync(
  t: Pick<TestConvex<typeof schema>, 'run' | 'mutation'>,
  userId: Id<'users'>,
): Promise<void> {
  for (let page = 0; page < 1000; page++) {
    const progress = (await t.run((ctx) => ctx.db.get(userId)))
      ?.lifecycleOwnerSync
    if (!progress || progress.stage === 3) return
    await t.mutation(internal.users.syncLifecycleOwnerStatePage, {
      userId,
      ...progress,
    })
  }
  throw new Error('Fixture lifecycle synchronization did not complete')
}

/**
 * Run the next purge page the way the scheduler would: claim when unclaimed,
 * otherwise continue with the stored step.
 */
export async function runAccountPurgePage(
  t: Pick<TestConvex<typeof schema>, 'run' | 'mutation'>,
  userId: Id<'users'>,
): Promise<void> {
  const step = (await t.run((ctx) => ctx.db.get(userId)))?.purgeProgress?.step
  await t.mutation(
    internal.users.scrubDeletedAccount,
    step == null ? { userId } : { userId, expectedStep: step },
  )
}

/** Enter the real deletion lifecycle and finish bounded purge in memory only. */
export async function purgeFixtureAccount(
  t: Pick<TestConvex<typeof schema>, 'run' | 'mutation'>,
  userId: Id<'users'>,
): Promise<void> {
  const now = Date.now()
  await t.run((ctx) =>
    ctx.db.patch(userId, {
      deletedAt: now - 30 * 24 * 60 * 60 * 1000,
      deactivatedAt: now - 30 * 24 * 60 * 60 * 1000,
      purgeAfter: now,
    }),
  )
  for (let page = 0; page < 1000; page++) {
    if ((await t.run((ctx) => ctx.db.get(userId)))?.purgedAt != null) return
    await runAccountPurgePage(t, userId)
  }
  throw new Error('Fixture account purge did not complete')
}
