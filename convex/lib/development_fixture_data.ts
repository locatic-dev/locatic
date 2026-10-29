import type { MutationCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import { DEFAULT_CITIES } from '../citiesSeed'
import { DEFAULT_REACTIONS } from '../reactionConfigSeed'
import type { FixtureIdentities } from './development_fixture_contracts'
import { SYNTHETIC_FIXTURE_CLERK_IDS } from './development_fixture_contracts'
import { createDefaultViewerProfile } from './viewer'
import {
  buildActorSnapshot,
  buildOwnerSnapshot,
  buildProjectExploreOwner,
  buildProjectSnapshot,
  getPostCityId,
} from './snapshots'
import { createCityStatsChanges } from './cityStats'
import { buildConversationKey } from './conversation'
import { buildPostSearchText } from './posts'
import { upsertHomeFeedItemForEvent } from './homeFeed'
import { buildProfileNotificationTarget } from './notifications'

/** Fixed-size fixture installation. Never fetches GitHub or sends email. */
export async function installDevelopmentFixtures(
  ctx: MutationCtx,
  identities: FixtureIdentities,
) {
  const now = Date.now(),
    recent = now - 3_600_000
  const cityStats = createCityStatsChanges()
  const cities: Id<'cities'>[] = []
  const names = [
    'bengaluru-in',
    'hyderabad-in',
    'berlin-de',
    'san-francisco-us',
    'new-york-us',
  ]
  const catalog = names.map(
    (slug) => DEFAULT_CITIES.find((city) => city.slug === slug)!,
  )
  catalog.push({
    slug: 'mysuru-in',
    name: 'Mysuru',
    displayName: 'Mysuru, Karnataka, India',
    region: 'Karnataka',
    country: 'India',
    countryCode: 'IN',
    lat: 12.2958,
    lng: 76.6394,
    address: null,
    aliases: ['mysore'],
    timezone: 'Asia/Kolkata',
  })
  for (const city of catalog) {
    cities.push(
      await ctx.db.insert('cities', {
        slug: city.slug,
        name: city.name,
        displayName: city.displayName,
        normalizedName: city.displayName.toLowerCase(),
        region: city.region,
        country: city.country,
        countryCode: city.countryCode,
        location: { lat: city.lat, lng: city.lng },
        address: city.address,
        aliases: city.aliases,
        timezone: city.timezone,
        searchText: [city.displayName, ...city.aliases].join(' ').toLowerCase(),
        isActive: true,
        stats: { builderCount: 0, projectCount: 0, lastActivityAt: null },
        createdAt: now,
        updatedAt: now,
      }),
    )
  }
  for (const reaction of DEFAULT_REACTIONS)
    await ctx.db.insert('reaction_config', {
      ...reaction,
      createdAt: now,
      updatedAt: now,
    })

  async function user(
    identity: FixtureIdentities['populated'],
    cityId: Id<'cities'> | null,
    onboarded = true,
    synthetic = false,
  ) {
    const base = createDefaultViewerProfile({
      ...identity,
      githubUrl: `https://github.com/${identity.githubUsername}`,
    })
    const id = await ctx.db.insert('users', {
      ...base,
      github: {
        username: identity.githubUsername,
        id: synthetic ? null : identity.githubId,
      },
      profile: {
        ...base.profile,
        cityId,
        bio: 'Disposable Locatic QA fixture. Synthetic showcase data.',
        buildStatus: 'open_to_collab',
        primaryLanguages: ['TypeScript'],
      },
      exploreConfig: {
        cityIds: cityId ? [cityId] : [],
        stackPrefs: ['TypeScript'],
      },
      emailVerified: !synthetic,
      notificationPrefs: {
        ...base.notificationPrefs,
        productUpdates: false,
        weeklyDigest: false,
      },
      ...(identity.clerkId === identities.populated.clerkId
        ? {
            githubContributions: {
              totalContributions: 14,
              weeks: [
                {
                  days: Array.from({ length: 7 }, (_, index) => ({
                    date: new Date(now - (6 - index) * 86_400_000)
                      .toISOString()
                      .slice(0, 10),
                    count: 2,
                  })),
                },
              ],
              syncedAt: now,
            },
          }
        : {}),
      onboardingCompletedAt: onboarded ? recent : null,
      githubLastSyncedAt: now,
    })
    cityStats.moveBuilder(null, cityId)
    return id
  }
  const populatedUserId = await user(identities.populated, cities[0])
  const emptyUserId = await user(identities.empty, cities[5])
  const onboardingUserId = await user(identities.onboarding, null, false)
  const support: Id<'users'>[] = []
  for (const [index, clerkId] of SYNTHETIC_FIXTURE_CLERK_IDS.entries()) {
    const role = clerkId.split(':')[1]
    support.push(
      await user(
        {
          clerkId,
          email: `${role}@example.invalid`,
          githubId: 10_000 + index,
          githubUsername: `locatic-qa-${role}`,
          displayName: `QA ${role}`,
          avatarUrl: '',
        },
        cities[index < 2 ? 0 : index - 1],
        true,
        true,
      ),
    )
  }
  const owners = [populatedUserId, ...support]
  const projects: Doc<'projects'>[] = []
  for (const [index, ownerId] of owners.entries()) {
    const owner = (await ctx.db.get(ownerId))!
    const name = 'fixture-showcase',
      fullName = `${owner.github.username}/${name}`
    const projectId = await ctx.db.insert('projects', {
      ownerId,
      github: {
        // Negative IDs explicitly distinguish fixture rows from real GitHub imports.
        repoId: -1000 - index,
        fullName,
        ownerLogin: owner.github.username,
        ownerLoginKey: owner.github.username.toLowerCase(),
        name,
        nameKey: name,
        description: 'Synthetic development fixture; not a GitHub import.',
        githubUrl: `https://github.com/${fullName}`,
        projectUrl: null,
        primaryLanguage: index === 2 ? 'Rust' : 'TypeScript',
        languages: [{ name: index === 2 ? 'Rust' : 'TypeScript', bytes: 1000 }],
        topics: ['maps', 'developer-tools'],
        stargazersCount: 0,
        lastCommitAt: recent,
        lastMetadataSyncedAt: now,
        lastMetadataSyncAttemptedAt: now,
        commitFrequency: 'active',
        readmePreview:
          '## Fixture showcase\n\nSynthetic data for isolated browser QA.',
        readmeAssetBaseUrl: null,
        readmeAssetRootUrl: null,
        readmeLinkBaseUrl: null,
        readmeLinkRootUrl: null,
      },
      locatic: {
        isVisible: true,
        tags: ['maps', 'developer-tools'],
        likesCount: 0,
        reactionCounts: {},
        commentsCount: 0,
        postsCount: 0,
        lastPublicActivityAt: recent,
      },
      exploreOwner: buildProjectExploreOwner(owner, true),
      ownerSnapshot: await buildOwnerSnapshot(ctx.db, owner),
      topContributorsSnapshot: [],
      contributorStats: {
        matchedCount: 0,
        lastSyncedAt: now,
        lastSyncAttemptedAt: now,
        syncCadence: 'weekly',
      },
      addedToLocaticAt: recent,
      updatedAt: now,
    })
    await ctx.db.patch(ownerId, {
      stats: { ...owner.stats, projectsCount: 1, lastPublicActivityAt: recent },
      pinnedProfileProjectIds: [projectId],
    })
    const project = (await ctx.db.get(projectId))!
    projects.push(project)
    await cityStats.moveProject(ctx.db, project, null, project)
  }
  const project = projects[0],
    bobProject = projects[1]
  const bob = (await ctx.db.get(support[0]))!,
    populated = (await ctx.db.get(populatedUserId))!
  const postId = await ctx.db.insert('posts', {
    projectId: bobProject._id,
    ownerId: bob._id,
    actorId: bob._id,
    authorRole: 'owner',
    body: 'Shipped the QA fixture release',
    searchText: buildPostSearchText({
      body: 'Shipped the QA fixture release',
      projectFullName: bobProject.github.fullName,
      topics: bobProject.locatic.tags,
    }),
    projectTopics: bobProject.locatic.tags,
    projectCityId: getPostCityId(bob),
    actorSnapshot: await buildActorSnapshot(ctx.db, bob),
    projectSnapshot: {
      name: bobProject.github.name,
      fullName: bobProject.github.fullName,
      ownerLogin: bob.github.username,
      primaryLanguage: bobProject.github.primaryLanguage,
      languages: bobProject.github.languages,
    },
    reactionCounts: {},
    commentsCount: 0,
    createdAt: recent,
    updatedAt: recent,
    deletedAt: null,
  })
  await ctx.db.patch(bobProject._id, {
    locatic: {
      ...bobProject.locatic,
      postsCount: 1,
      likesCount: 1,
      reactionCounts: { like: 1 },
    },
  })
  await ctx.db.insert('reactions', {
    userId: populatedUserId,
    targetType: 'project',
    targetId: bobProject._id,
    reactionType: 'like',
    createdAt: recent,
  })
  await ctx.db.insert('project_releases', {
    projectId: project._id,
    githubReleaseId: -1,
    tagName: 'v0.1.0-fixture',
    name: 'QA fixture release',
    body: 'Synthetic release',
    htmlUrl: `${project.github.githubUrl}/releases/tag/v0.1.0-fixture`,
    isDraft: false,
    isPrerelease: false,
    publishedAt: recent,
    createdAt: recent,
    updatedAt: recent,
    importedAt: now,
  })
  await ctx.db.insert('follows', {
    followerId: populatedUserId,
    followingId: bob._id,
    createdAt: recent,
  })
  await ctx.db.patch(bob._id, {
    stats: { ...bob.stats, followersCount: 1, postsCount: 1 },
  })
  await ctx.db.patch(populatedUserId, {
    stats: {
      ...populated.stats,
      followingCount: 1,
      likedCount: 1,
      commentsCount: 1,
    },
  })
  const projectSnapshot = buildProjectSnapshot(bobProject),
    actorSnapshot = await buildActorSnapshot(ctx.db, bob)
  const target = {
    kind: 'post' as const,
    projectId: bobProject._id,
    postId,
    projectSnapshot,
    postSnapshot: {
      body: 'Shipped the QA fixture release',
      commentsCount: 0,
      reactionCounts: {},
    },
  }
  const eventId = await ctx.db.insert('activity_events', {
    actorId: bob._id,
    eventType: 'post_created',
    projectId: bobProject._id,
    postId,
    commentId: null,
    actorSnapshot,
    projectSnapshot,
    postSnapshot: target.postSnapshot,
    target,
    createdAt: recent,
  })
  const event = (await ctx.db.get(eventId))!
  await upsertHomeFeedItemForEvent(
    ctx,
    {
      userId: populatedUserId,
      sourceEventId: eventId,
      dedupeKey: `${populatedUserId}:${eventId}`,
      reason: 'following',
      priority: 1,
      actorId: bob._id,
      eventType: 'post_created',
      projectId: bobProject._id,
      postId,
      actorSnapshot,
      projectSnapshot,
      postSnapshot: target.postSnapshot,
      target,
      createdAt: recent,
    },
    event.target!,
  )

  const targetSnapshot = {
    projectFullName: project.github.fullName,
    projectOwner: populated.github.username,
    projectRepo: project.github.name,
    targetLabel: project.github.name,
    updateTitle: null,
  }
  const commentId = await ctx.db.insert('comments', {
    targetType: 'project',
    targetId: project._id,
    parentId: null,
    authorId: populatedUserId,
    authorSnapshot: await buildActorSnapshot(ctx.db, populated),
    content: 'Fixture root discussion',
    replyCount: 1,
    likesCount: 0,
    reactionCounts: {},
    isDeleted: false,
    targetSnapshot,
    createdAt: recent,
  })
  const replyId = await ctx.db.insert('comments', {
    targetType: 'project',
    targetId: project._id,
    parentId: commentId,
    authorId: bob._id,
    authorSnapshot: actorSnapshot,
    content: 'Fixture nested reply',
    replyCount: 1,
    likesCount: 0,
    reactionCounts: {},
    isDeleted: false,
    targetSnapshot,
    createdAt: recent + 1,
  })
  await ctx.db.insert('comments', {
    targetType: 'project',
    targetId: project._id,
    parentId: replyId,
    authorId: bob._id,
    authorSnapshot: actorSnapshot,
    content: 'Fixture destination leaf',
    replyCount: 0,
    likesCount: 0,
    reactionCounts: {},
    isDeleted: false,
    targetSnapshot,
    createdAt: recent + 2,
  })
  await ctx.db.patch(project._id, {
    locatic: { ...project.locatic, commentsCount: 3 },
  })
  const bobNow = (await ctx.db.get(bob._id))!
  await ctx.db.patch(bob._id, { stats: { ...bobNow.stats, commentsCount: 2 } })
  let conversationId: Id<'conversations'> | null = null
  for (const [index, otherId] of support.slice(0, 2).entries()) {
    const [participantLowId, participantHighId] = [
      populatedUserId,
      otherId,
    ].sort()
    const senderId = index === 0 ? otherId : populatedUserId,
      recipientId = index === 0 ? populatedUserId : otherId
    const content =
      index === 0 ? 'Fixture conversation' : 'Fixture outgoing request'
    const id = await ctx.db.insert('conversations', {
      conversationKey: buildConversationKey(populatedUserId, otherId),
      participantLowId,
      participantHighId,
      messageSequence: 1,
      lastMessage: { content, senderId, sentAt: recent },
      unreadCounts: { [senderId]: 0, [recipientId]: 1 },
      isRequest: index === 1,
      createdAt: recent,
      updatedAt: recent,
    })
    await ctx.db.insert('messages', {
      conversationId: id,
      sequence: 1,
      senderId,
      content,
      readAt: null,
      createdAt: recent,
    })
    await ctx.db.patch(recipientId, { unreadMessagesCount: 1 })
    if (index === 0) conversationId = id
  }
  await ctx.db.insert('notifications', {
    recipientId: populatedUserId,
    actorId: bob._id,
    type: 'followed',
    projectId: null,
    postId: null,
    commentId: null,
    actorSnapshot: {
      displayName: bob.profile.displayName,
      avatarUrl: bob.profile.avatarUrl,
    },
    projectName: null,
    target: buildProfileNotificationTarget(bob.github.username),
    isRead: false,
    createdAt: recent,
  })
  await cityStats.apply(ctx.db)
  return {
    populatedUserId,
    emptyUserId,
    onboardingUserId,
    projectId: project._id,
    conversationId: conversationId!,
    commentId,
    projectOwner: populated.github.username,
    projectRepo: project.github.name,
  }
}
