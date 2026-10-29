import type {
  DocumentByInfo,
  GenericTableInfo,
  NamedTableInfo,
  OrderedQuery,
} from 'convex/server'
import type { DataModel, Doc, Id, TableNames } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { createDefaultViewerProfile } from './viewer'
import { shouldPurgeDeletedAccount } from './account_deletion'
import {
  createPurgeVisitors,
  type PurgeTable,
  type PurgeVisitors,
} from './account_purge_erasure'

// Stage ordinals are stored in `users.purgeProgress`; never reorder them.
// Projects and posts come last so earlier stages can still resolve references
// to the erased account's work.
const PURGE_TABLES = [
  'comments',
  'reactions',
  'follows',
  'notifications',
  'messages',
  'conversations',
  'activity_events',
  'home_feed_items',
  'pulse_snapshots',
  'project_contributors',
  'reports',
  'saved_projects',
  'github_tokens',
  'github_sync_log',
  'explore_history',
  'explore_post_history',
  'email_sends',
  'email_preference_changes',
  'project_releases',
  'posts',
  'projects',
] as const satisfies ReadonlyArray<PurgeTable>
export type PurgeProgress = NonNullable<Doc<'users'>['purgeProgress']>

const PURGE_PAGE_SIZE = 25
// Each page reads at most this much from its paginated query, far below the
// per-transaction read limit, leaving room for the visitors' own reads.
const PURGE_PAGE_BYTES = 256_000
const PURGE_TARGET_BATCH_SIZE = 25
/**
 * Query shape of `purgeProgress` cursors. Progress without this version and
 * with a non-null cursor came from the original single-query stages and must
 * finish its stage with that query (`accountIndexed` alone cannot tell: it was
 * also set on stages that always scanned globally).
 */
export const PURGE_QUERY_VERSION = 2

type TableQuery<T extends TableNames> = OrderedQuery<
  NamedTableInfo<DataModel, T>
>
type PageResult = { isDone: boolean; cursor: string }

/** One bounded page over a single query; the visitor decides what to erase. */
type RowsSource = {
  kind: 'rows'
  run: (cursor: string | null) => Promise<PageResult>
}

/**
 * Rows attached to the erased account's own targets (projects, posts or
 * conversations). Convex allows one `.paginate()` per execution, so a page
 * either discovers a batch of targets for the stored queue or pages the first
 * queued target's rows through its index. Both reads are capped in bytes.
 */
type RelatedSource = {
  kind: 'related'
  nextTargets: (
    cursor: string | null,
  ) => Promise<PageResult & { targetIds: string[] }>
  run: (targetId: string, cursor: string | null) => Promise<PageResult>
}

type PurgeSource = RowsSource | RelatedSource

function rowsSource<TableInfo extends GenericTableInfo>(
  query: () => OrderedQuery<TableInfo>,
  visit: (row: DocumentByInfo<NoInfer<TableInfo>>) => Promise<void>,
): RowsSource {
  return {
    kind: 'rows',
    run: async (cursor) => {
      const page = await query().paginate({
        cursor,
        numItems: PURGE_PAGE_SIZE,
        maximumRowsRead: PURGE_PAGE_SIZE,
        maximumBytesRead: PURGE_PAGE_BYTES,
      })
      for (const row of page.page) await visit(row)
      return { isDone: page.isDone, cursor: page.continueCursor }
    },
  }
}

function relatedSource<T extends TableNames, RowInfo extends GenericTableInfo>(
  ctx: MutationCtx,
  targetTable: T,
  targets: () => TableQuery<T>,
  rowsFor: (targetId: Id<T>) => OrderedQuery<RowInfo>,
  visit: (row: DocumentByInfo<NoInfer<RowInfo>>) => Promise<void>,
): RelatedSource {
  return {
    kind: 'related',
    nextTargets: async (cursor) => {
      const page = await targets().paginate({
        cursor,
        numItems: PURGE_TARGET_BATCH_SIZE,
        maximumRowsRead: PURGE_TARGET_BATCH_SIZE,
        maximumBytesRead: PURGE_PAGE_BYTES,
      })
      return {
        targetIds: page.page.map((target) => target._id),
        isDone: page.isDone,
        cursor: page.continueCursor,
      }
    },
    run: async (targetId, cursor) => {
      const id = ctx.db.normalizeId(targetTable, targetId)
      if (!id) return { isDone: true, cursor: '' }
      return await rowsSource(() => rowsFor(id), visit).run(cursor)
    },
  }
}

/**
 * The original query of each stage: a whole-table scan, or the account index
 * for the five tables that had one when `accountIndexed` was set. Only used
 * to finish a stage whose stored cursor belongs to this shape.
 */
function legacySource(
  ctx: MutationCtx,
  table: PurgeTable,
  userId: Id<'users'>,
  accountIndexed: boolean,
  visit: PurgeVisitors,
): RowsSource {
  switch (table) {
    case 'reports':
      return rowsSource(
        () =>
          accountIndexed
            ? ctx.db
                .query('reports')
                .withIndex('by_reporter', (q) => q.eq('reporterId', userId))
            : ctx.db.query('reports'),
        visit.reports,
      )
    case 'github_tokens':
      return rowsSource(
        () =>
          accountIndexed
            ? ctx.db
                .query('github_tokens')
                .withIndex('by_user_id', (q) => q.eq('userId', userId))
            : ctx.db.query('github_tokens'),
        visit.github_tokens,
      )
    case 'github_sync_log':
      return rowsSource(
        () =>
          accountIndexed
            ? ctx.db
                .query('github_sync_log')
                .withIndex('by_user_synced_at', (q) => q.eq('userId', userId))
            : ctx.db.query('github_sync_log'),
        visit.github_sync_log,
      )
    case 'email_sends':
      return rowsSource(
        () =>
          accountIndexed
            ? ctx.db
                .query('email_sends')
                .withIndex('by_user_and_status_and_created_at', (q) =>
                  q.eq('userId', userId),
                )
            : ctx.db.query('email_sends'),
        visit.email_sends,
      )
    case 'email_preference_changes':
      return rowsSource(
        () =>
          accountIndexed
            ? ctx.db
                .query('email_preference_changes')
                .withIndex('by_user_and_changed_at', (q) =>
                  q.eq('userId', userId),
                )
            : ctx.db.query('email_preference_changes'),
        visit.email_preference_changes,
      )
    default:
      return globalSource(ctx, table, visit)
  }
}

function globalSource(
  ctx: MutationCtx,
  table: PurgeTable,
  visit: PurgeVisitors,
): RowsSource {
  // A switch keeps each table's row type paired with its visitor.
  switch (table) {
    case 'comments':
      return rowsSource(() => ctx.db.query('comments'), visit.comments)
    case 'reactions':
      return rowsSource(() => ctx.db.query('reactions'), visit.reactions)
    case 'follows':
      return rowsSource(() => ctx.db.query('follows'), visit.follows)
    case 'notifications':
      return rowsSource(
        () => ctx.db.query('notifications'),
        visit.notifications,
      )
    case 'messages':
      return rowsSource(() => ctx.db.query('messages'), visit.messages)
    case 'conversations':
      return rowsSource(
        () => ctx.db.query('conversations'),
        visit.conversations,
      )
    case 'activity_events':
      return rowsSource(
        () => ctx.db.query('activity_events'),
        visit.activity_events,
      )
    case 'home_feed_items':
      return rowsSource(
        () => ctx.db.query('home_feed_items'),
        visit.home_feed_items,
      )
    case 'pulse_snapshots':
      return rowsSource(
        () => ctx.db.query('pulse_snapshots'),
        visit.pulse_snapshots,
      )
    case 'project_contributors':
      return rowsSource(
        () => ctx.db.query('project_contributors'),
        visit.project_contributors,
      )
    case 'reports':
      return rowsSource(() => ctx.db.query('reports'), visit.reports)
    case 'saved_projects':
      return rowsSource(
        () => ctx.db.query('saved_projects'),
        visit.saved_projects,
      )
    case 'github_tokens':
      return rowsSource(
        () => ctx.db.query('github_tokens'),
        visit.github_tokens,
      )
    case 'github_sync_log':
      return rowsSource(
        () => ctx.db.query('github_sync_log'),
        visit.github_sync_log,
      )
    case 'explore_history':
      return rowsSource(
        () => ctx.db.query('explore_history'),
        visit.explore_history,
      )
    case 'explore_post_history':
      return rowsSource(
        () => ctx.db.query('explore_post_history'),
        visit.explore_post_history,
      )
    case 'email_sends':
      return rowsSource(() => ctx.db.query('email_sends'), visit.email_sends)
    case 'email_preference_changes':
      return rowsSource(
        () => ctx.db.query('email_preference_changes'),
        visit.email_preference_changes,
      )
    case 'project_releases':
      return rowsSource(
        () => ctx.db.query('project_releases'),
        visit.project_releases,
      )
    case 'posts':
      return rowsSource(() => ctx.db.query('posts'), visit.posts)
    case 'projects':
      return rowsSource(() => ctx.db.query('projects'), visit.projects)
  }
}

/**
 * Indexed phases for each stage (query version 2). Account-keyed rows use the
 * account index; rows other members attached to the erased account's
 * projects, posts or conversations are reached through those targets.
 *
 * Whole-table scans remain only where a copy can reference the account
 * without an index on that reference: notification, activity, Home and
 * Pulse snapshots, and other projects' contributor snapshots.
 */
function indexedSources(
  ctx: MutationCtx,
  table: PurgeTable,
  userId: Id<'users'>,
  visit: PurgeVisitors,
): PurgeSource[] {
  const ownedProjects = () =>
    ctx.db
      .query('projects')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
  const authoredPosts = () =>
    ctx.db
      .query('posts')
      .withIndex('by_actor_deleted_created', (q) => q.eq('actorId', userId))
  const ownedPosts = () =>
    ctx.db
      .query('posts')
      .withIndex('by_owner_deleted_created', (q) => q.eq('ownerId', userId))
  const conversationsAsLow = () =>
    ctx.db
      .query('conversations')
      .withIndex('by_participant_low_updated', (q) =>
        q.eq('participantLowId', userId),
      )
  const conversationsAsHigh = () =>
    ctx.db
      .query('conversations')
      .withIndex('by_participant_high_updated', (q) =>
        q.eq('participantHighId', userId),
      )
  const postTargets = [authoredPosts, ownedPosts]

  switch (table) {
    case 'comments': {
      const commentsOn = (targetId: string) =>
        ctx.db
          .query('comments')
          .withIndex('by_target_created', (q) => q.eq('targetId', targetId))
      return [
        rowsSource(
          () =>
            ctx.db
              .query('comments')
              .withIndex('by_author', (q) => q.eq('authorId', userId)),
          visit.comments,
        ),
        relatedSource(
          ctx,
          'projects',
          ownedProjects,
          commentsOn,
          visit.comments,
        ),
        ...postTargets.map((posts) =>
          relatedSource(ctx, 'posts', posts, commentsOn, visit.comments),
        ),
      ]
    }
    case 'reactions':
      return [
        rowsSource(
          () =>
            ctx.db
              .query('reactions')
              .withIndex('by_user', (q) => q.eq('userId', userId)),
          visit.reactions,
        ),
        relatedSource(
          ctx,
          'projects',
          ownedProjects,
          (projectId: Id<'projects'>) =>
            ctx.db
              .query('reactions')
              .withIndex('by_target', (q) =>
                q.eq('targetType', 'project').eq('targetId', projectId),
              ),
          visit.reactions,
        ),
        ...postTargets.map((posts) =>
          relatedSource(
            ctx,
            'posts',
            posts,
            (postId: Id<'posts'>) =>
              ctx.db
                .query('reactions')
                .withIndex('by_target', (q) =>
                  q.eq('targetType', 'post').eq('targetId', postId),
                ),
            visit.reactions,
          ),
        ),
      ]
    case 'follows':
      return [
        rowsSource(
          () =>
            ctx.db
              .query('follows')
              .withIndex('by_follower', (q) => q.eq('followerId', userId)),
          visit.follows,
        ),
        rowsSource(
          () =>
            ctx.db
              .query('follows')
              .withIndex('by_following', (q) => q.eq('followingId', userId)),
          visit.follows,
        ),
      ]
    case 'messages': {
      const messagesIn = (conversationId: Id<'conversations'>) =>
        ctx.db
          .query('messages')
          .withIndex('by_conversation', (q) =>
            q.eq('conversationId', conversationId),
          )
      return [
        // Sent messages first, including any whose conversation is gone.
        rowsSource(
          () =>
            ctx.db
              .query('messages')
              .withIndex('by_sender_created', (q) => q.eq('senderId', userId)),
          visit.messages,
        ),
        relatedSource(
          ctx,
          'conversations',
          conversationsAsLow,
          messagesIn,
          visit.messages,
        ),
        relatedSource(
          ctx,
          'conversations',
          conversationsAsHigh,
          messagesIn,
          visit.messages,
        ),
      ]
    }
    case 'conversations':
      return [
        rowsSource(conversationsAsLow, visit.conversations),
        rowsSource(conversationsAsHigh, visit.conversations),
      ]
    case 'project_contributors':
      return [
        rowsSource(
          () =>
            ctx.db
              .query('project_contributors')
              .withIndex('by_user', (q) => q.eq('userId', userId)),
          visit.project_contributors,
        ),
        relatedSource(
          ctx,
          'projects',
          ownedProjects,
          (projectId: Id<'projects'>) =>
            ctx.db
              .query('project_contributors')
              .withIndex('by_project', (q) => q.eq('projectId', projectId)),
          visit.project_contributors,
        ),
      ]
    case 'reports':
    case 'github_tokens':
    case 'github_sync_log':
    case 'email_sends':
    case 'email_preference_changes':
      return [legacySource(ctx, table, userId, true, visit)]
    case 'saved_projects':
      return [
        rowsSource(
          () =>
            ctx.db
              .query('saved_projects')
              .withIndex('by_user_created', (q) => q.eq('userId', userId)),
          visit.saved_projects,
        ),
        relatedSource(
          ctx,
          'projects',
          ownedProjects,
          (projectId: Id<'projects'>) =>
            ctx.db
              .query('saved_projects')
              .withIndex('by_project', (q) => q.eq('projectId', projectId)),
          visit.saved_projects,
        ),
      ]
    case 'explore_history':
      return [
        rowsSource(
          () =>
            ctx.db
              .query('explore_history')
              .withIndex('by_user_project', (q) => q.eq('userId', userId)),
          visit.explore_history,
        ),
        relatedSource(
          ctx,
          'projects',
          ownedProjects,
          (projectId: Id<'projects'>) =>
            ctx.db
              .query('explore_history')
              .withIndex('by_project', (q) => q.eq('projectId', projectId)),
          visit.explore_history,
        ),
      ]
    case 'explore_post_history':
      return [
        rowsSource(
          () =>
            ctx.db
              .query('explore_post_history')
              .withIndex('by_user_post', (q) => q.eq('userId', userId)),
          visit.explore_post_history,
        ),
        ...postTargets.map((posts) =>
          relatedSource(
            ctx,
            'posts',
            posts,
            (postId: Id<'posts'>) =>
              ctx.db
                .query('explore_post_history')
                .withIndex('by_post', (q) => q.eq('postId', postId)),
            visit.explore_post_history,
          ),
        ),
      ]
    case 'project_releases':
      return [
        relatedSource(
          ctx,
          'projects',
          ownedProjects,
          (projectId: Id<'projects'>) =>
            ctx.db
              .query('project_releases')
              .withIndex('by_project_published', (q) =>
                q.eq('projectId', projectId),
              ),
          visit.project_releases,
        ),
      ]
    case 'posts':
      // Erasing an authored post sets `deletedAt`, which moves it later in
      // this index; the revisit is idempotent and keeps that timestamp.
      return [
        rowsSource(authoredPosts, visit.posts),
        rowsSource(ownedPosts, visit.posts),
      ]
    case 'projects':
      return [
        rowsSource(ownedProjects, visit.projects),
        // Contributor snapshots on other members' projects have no index.
        globalSource(ctx, table, visit),
      ]
    case 'notifications':
    case 'activity_events':
    case 'home_feed_items':
    case 'pulse_snapshots':
      return [globalSource(ctx, table, visit)]
  }
}

function startStage(stage: number): PurgeProgress {
  return {
    stage,
    cursor: null,
    queryVersion: PURGE_QUERY_VERSION,
    phase: 0,
    targetCursor: null,
    targetQueue: [],
  }
}

async function runLegacyPage(
  ctx: MutationCtx,
  table: PurgeTable,
  user: Doc<'users'>,
  progress: PurgeProgress,
  visit: PurgeVisitors,
): Promise<PurgeProgress> {
  const accountIndexed = progress.accountIndexed === true
  const page = await legacySource(
    ctx,
    table,
    user._id,
    accountIndexed,
    visit,
  ).run(progress.cursor)
  return page.isDone
    ? startStage(progress.stage + 1)
    : { stage: progress.stage, cursor: page.cursor, accountIndexed }
}

async function runIndexedPage(
  ctx: MutationCtx,
  table: PurgeTable,
  user: Doc<'users'>,
  progress: PurgeProgress,
  visit: PurgeVisitors,
): Promise<PurgeProgress> {
  const sources = indexedSources(ctx, table, user._id, visit)
  const phase = progress.phase ?? 0
  const source = sources[phase]
  const nextPhase = (): PurgeProgress =>
    phase + 1 < sources.length
      ? { ...startStage(progress.stage), phase: phase + 1 }
      : startStage(progress.stage + 1)
  if (!source) return nextPhase()

  if (source.kind === 'rows') {
    const page = await source.run(progress.cursor)
    return page.isDone
      ? nextPhase()
      : { ...startStage(progress.stage), phase, cursor: page.cursor }
  }

  const targetCursor = progress.targetCursor ?? null
  const [targetId, ...queued] = progress.targetQueue ?? []
  if (!targetId) {
    const batch = await source.nextTargets(targetCursor)
    if (batch.targetIds.length === 0 && batch.isDone) return nextPhase()
    return {
      ...startStage(progress.stage),
      phase,
      targetCursor: batch.cursor,
      targetQueue: batch.targetIds,
    }
  }
  const page = await source.run(targetId, progress.cursor)
  return {
    ...startStage(progress.stage),
    phase,
    cursor: page.isDone ? null : page.cursor,
    targetCursor,
    targetQueue: page.isDone ? queued : [targetId, ...queued],
  }
}

export function buildPurgedAccount(user: Doc<'users'>, now: number) {
  const neutral = createDefaultViewerProfile({
    clerkId: user.clerkId,
    email: `deleted+${user._id}@locatic.invalid`,
    githubId: null,
    githubUsername: `deleted-${user._id}`,
    githubUrl: 'https://github.com',
    avatarUrl: '',
    displayName: 'Deleted User',
  })
  return {
    ...neutral,
    profile: { ...neutral.profile, fullName: null },
    discoverability: { searchText: '' },
    privacy: {
      ...neutral.privacy,
      profileVisibility: 'locatic_only' as const,
      followGraphVisibility: 'private' as const,
      commentHistoryVisibility: 'private' as const,
      likedProjectsVisibility: 'private' as const,
      contributionsVisibility: 'private' as const,
      cityVisibility: 'hidden' as const,
      appearInPulse: false,
    },
    notificationPrefs: Object.fromEntries(
      Object.keys(neutral.notificationPrefs).map((key) => [key, false]),
    ) as typeof neutral.notificationPrefs,
    appearInExplore: false,
    createdAt: now,
    deletedAt: user.deletedAt ?? now,
    deactivatedAt: user.deactivatedAt ?? now,
    purgedAt: now,
    purgeAfter: null,
  }
}

/**
 * Claims a due purge in the same transaction that removes it from the
 * `by_purge_after` index, so cleanup and the deadline timer cannot both start
 * a chain. Progress written before claims existed (no `step`) is adopted once.
 * Returns the progress to run, or null when another chain owns the purge or
 * the account is not due.
 */
export async function claimAccountPurge(
  ctx: MutationCtx,
  user: Doc<'users'>,
  now: number,
): Promise<PurgeProgress | null> {
  if (user.purgedAt != null || user.deletedAt == null) return null
  const current = user.purgeProgress
  if (current?.step != null) return null
  if (!current && !shouldPurgeDeletedAccount(user, now)) return null
  const progress: PurgeProgress = current
    ? { ...current, step: 0 }
    : { ...startStage(0), step: 0 }
  await ctx.db.patch(user._id, { purgeProgress: progress, purgeAfter: null })
  return progress
}

/** The claimed progress if `expectedStep` is still current; stale jobs get null. */
export function getClaimedPurgeProgress(
  user: Doc<'users'>,
  expectedStep: number,
): PurgeProgress | null {
  const progress = user.purgeProgress
  return user.purgedAt == null &&
    user.deletedAt != null &&
    progress?.step === expectedStep
    ? progress
    : null
}

/**
 * Runs one bounded page of a claimed purge and commits its progress. Returns
 * the next progress to schedule, or null once the account is a tombstone.
 */
export async function purgeAccountPage(
  ctx: MutationCtx,
  user: Doc<'users'>,
  progress: PurgeProgress,
): Promise<PurgeProgress | null> {
  const table = PURGE_TABLES[progress.stage]
  if (!table) {
    await ctx.db.replace(user._id, buildPurgedAccount(user, Date.now()))
    return null
  }
  const visit = createPurgeVisitors(ctx, user)
  const legacyCursor =
    progress.cursor !== null && progress.queryVersion !== PURGE_QUERY_VERSION
  const page = legacyCursor
    ? await runLegacyPage(ctx, table, user, progress, visit)
    : await runIndexedPage(ctx, table, user, progress, visit)
  const next = { ...page, step: (progress.step ?? 0) + 1 }
  await ctx.db.patch(user._id, { purgeProgress: next })
  return next
}
