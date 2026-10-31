import type { QueryCtx } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'
import {
  buildActorSnapshot,
  buildOwnerSnapshot,
  buildProjectExploreOwner,
  getPostCityId,
} from './snapshots'
import { getBuilderCityId } from './cityStats'
import { getHomeFeedCutoff } from './homeFeed'
import { normalizeProjectRouteKey } from './project_route'

export const READINESS_TABLES = [
  'users',
  'projects',
  'posts',
  'cities',
  'reaction_config',
  'notifications',
  'home_feed_items',
  'pulse_snapshots',
  'scheduled',
] as const
export type ReadinessTable = (typeof READINESS_TABLES)[number]
export type CountPair = { builderCount: number; projectCount: number }

/** Pure query entry for the CLI's server-enforced read-only sandbox. No identities/content returned. */
export async function auditReadinessPage(
  ctx: Pick<QueryCtx, 'db'>,
  args: { table: ReadinessTable; cursor: string | null },
) {
  const issues: Record<string, number> = {},
    expectedCities: Record<string, CountPair> = {},
    storedCities: Record<string, CountPair> = {}
  const expectedUserPosts: Record<string, number> = {},
    storedUserPosts: Record<string, number> = {},
    expectedProjectPosts: Record<string, number> = {},
    storedProjectPosts: Record<string, number> = {}
  const issue = (name: string) => {
    issues[name] = (issues[name] ?? 0) + 1
  }
  const city = (id: string) =>
    (expectedCities[id] ??= { builderCount: 0, projectCount: 0 })
  const count = (map: Record<string, number>, id: string) => {
    map[id] = (map[id] ?? 0) + 1
  }
  const differs = (stored: object, expected: object) =>
    Object.entries(expected).some(
      ([key, value]) => (stored as Record<string, unknown>)[key] !== value,
    )
  const options = {
    cursor: args.cursor,
    numItems: 25,
    maximumRowsRead: 25,
    maximumBytesRead: 128_000,
  }
  const totals = {
    expectedCities,
    storedCities,
    expectedUserPosts,
    storedUserPosts,
    expectedProjectPosts,
    storedProjectPosts,
  }
  if (args.table === 'scheduled') {
    const page = await ctx.db.system
      .query('_scheduled_functions')
      .paginate(options)
    for (const job of page.page)
      if (job.state.kind === 'pending' || job.state.kind === 'inProgress')
        issue(`pendingJob:${job.name}`)
    return {
      ...totals,
      issues,
      scanned: page.page.length,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    }
  }
  const page = await ctx.db.query(args.table).paginate(options)
  for (const row of page.page) {
    switch (args.table) {
      case 'users': {
        const user = row as Doc<'users'>
        if (Object.hasOwn(user, 'emailSubscription'))
          issue('legacyEmailSubscription')
        if (Object.hasOwn(user.privacy, 'appearInPulse'))
          issue('legacyAppearInPulse')
        if (user.profile.fullName !== user.profile.displayName)
          issue('divergentFullName')
        if (user.stats.postsCount === undefined) issue('missingUserPostsCount')
        if (user.emailVerified === undefined) issue('missingEmailVerification')
        if (user.notificationPrefs.productUpdates === undefined)
          issue('missingProductUpdatePreference')
        if (
          user.lifecycleOwnerSync &&
          user.lifecycleOwnerSync.stage < 3 &&
          user.purgedAt == null
        )
          issue('pendingOwnerSync')
        if (user.purgeProgress) issue('purgeInProgress')
        const cityId = getBuilderCityId(user)
        if (cityId) city(cityId).builderCount++
        storedUserPosts[user._id] = user.stats.postsCount ?? 0
        break
      }
      case 'projects': {
        const project = row as Doc<'projects'>,
          owner = await ctx.db.get(project.ownerId)
        if (
          project.github.ownerLoginKey !==
            normalizeProjectRouteKey(project.github.ownerLogin) ||
          project.github.nameKey !==
            normalizeProjectRouteKey(project.github.name)
        )
          issue('projectRouteKeyMismatch')
        for (const key of [
          'readmeAssetBaseUrl',
          'readmeAssetRootUrl',
          'readmeLinkBaseUrl',
          'readmeLinkRootUrl',
        ] as const)
          if (!Object.hasOwn(project.github, key)) issue('missingReadmeBaseKey')
        if (!owner) {
          issue('missingProjectOwner')
          break
        }
        const explore = buildProjectExploreOwner(
          owner,
          project.locatic.isVisible,
        )
        if (
          differs(project.exploreOwner, explore) ||
          differs(
            project.ownerSnapshot,
            await buildOwnerSnapshot(ctx.db, owner),
          )
        )
          issue('projectOwnerStateMismatch')
        if (explore.isEligible && explore.cityId)
          city(explore.cityId).projectCount++
        storedProjectPosts[project._id] = project.locatic.postsCount ?? 0
        break
      }
      case 'posts': {
        const post = row as Doc<'posts'>,
          owner = await ctx.db.get(post.ownerId)
        if (!owner) issue('missingPostOwner')
        else if (post.projectCityId !== getPostCityId(owner))
          issue('postOwnerCityMismatch')
        if (post.deletedAt == null) {
          count(expectedUserPosts, post.actorId)
          count(expectedProjectPosts, post.projectId)
          const actor = await ctx.db.get(post.actorId)
          if (!actor) issue('missingPostActor')
          else if (
            differs(post.actorSnapshot, await buildActorSnapshot(ctx.db, actor))
          )
            issue('postActorSnapshotMismatch')
        }
        break
      }
      case 'cities': {
        const city = row as Doc<'cities'>
        storedCities[city._id] = {
          builderCount: city.stats?.builderCount ?? 0,
          projectCount: city.stats?.projectCount ?? 0,
        }
        break
      }
      case 'reaction_config': {
        const reaction = row as Doc<'reaction_config'>
        if (Object.hasOwn(reaction, 'icon')) issue('legacyReactionIcon')
        if (!reaction.key) issue('missingReactionKey')
        break
      }
      case 'notifications': {
        const notification = row as Doc<'notifications'>
        if (
          !notification.target ||
          !Object.hasOwn(notification.target, 'inboxTab')
        )
          issue('legacyNotificationTarget')
        if (
          notification.projectId &&
          !(await ctx.db.get(notification.projectId))
        )
          issue('notificationDeletedProjectTarget')
        break
      }
      case 'home_feed_items': {
        const item = row as Doc<'home_feed_items'>
        if (
          item.createdAt >= getHomeFeedCutoff(Date.now()) &&
          (!item.rowKind || !item.target)
        )
          issue('retainedLegacyHomeRow')
        break
      }
      case 'pulse_snapshots':
        issue('retainedPulseSnapshot')
        break
    }
  }
  return {
    ...totals,
    issues,
    scanned: page.page.length,
    isDone: page.isDone,
    continueCursor: page.continueCursor,
  }
}
