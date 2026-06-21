# Locatic Database Design

> **Product:** Locatic
> **Database style:** Convex-first document model
> **Version:** MVP
> **Status:** Draft

---

## 1. Overview

This document defines the database design for Locatic's MVP.

Locatic is a social discovery product for developers. The data model has to support:

- GitHub-authenticated users
- city-based discovery
- project profiles, posts, and GitHub releases
- open social interactions: likes, comments, follows, DMs
- contributor matching from GitHub
- a Home feed that is fast to read in Convex

### Core design decisions

- Keep hot read models denormalized where it materially improves feed and card rendering
- Keep private or sensitive GitHub credential data outside public user profile fields
- Normalize city data into a dedicated `cities` collection and reference it via `cityId`
- Normalize contributor relationships into a dedicated `project_contributors` collection
- Materialize Home feed entries into `home_feed_items` instead of querying with Mongo-style `IN` patterns
- Use scheduled jobs for cleanup and sync workflows
- Enforce logical uniqueness in mutation logic, with indexes supporting lookup rather than acting as relational constraints

---

## 2. Collection List

Locatic uses the following collections:

- `github_tokens`
- `cities`
- `users`
- `projects`
- `project_contributors`
- `project_releases`
- `reaction_config`
- `reactions`
- `comments`
- `follows`
- `activity_events`
- `home_feed_items`
- `conversations`
- `messages`
- `notifications`
- `github_sync_log`
- `contributor_sync_config`

---

## 3. Shared Types

```ts
type BuildStatus =
  | 'building_solo'
  | 'looking_for_cofounder'
  | 'open_to_collab'
  | 'hiring'
  | 'just_exploring'

type CommitFrequency = 'active' | 'slow' | 'dormant'

type ContributorSyncCadence = 'daily' | 'weekly' | 'monthly'

type EventType =
  | 'project_posted'
  | 'post_created'
  | 'project_liked'
  | 'project_commented'
  | 'post_commented'
  | 'contributor_matched'

type FeedReason = 'following' | 'liked_project_update'

type NotificationType =
  | 'project_liked'
  | 'post_reacted'
  | 'project_commented'
  | 'post_commented'
  | 'comment_replied'
  | 'followed'
  | 'dm_received'
  | 'contributor_recognized'
```

---

## 4. Collection: `github_tokens`

Stores encrypted GitHub OAuth credentials separately from the user profile so hot user documents stay safer and leaner.

```ts
interface GithubToken {
  _id: string
  userId: string
  accessTokenEnc: string
  tokenStatus: 'active' | 'revoked' | 'needs_reauth'
  scopes: string[]
  lastUsedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
```

### Field notes

- `_id`: Primary key for the token document
- `userId`: References `users._id`
- `accessTokenEnc`: AES-encrypted GitHub OAuth token, never exposed to clients
- `tokenStatus`: Current health state of the token
- `scopes`: Granted GitHub OAuth scopes
- `lastUsedAt`: Last successful GitHub API usage time

### Indexes

- `by_user_id -> ["userId"]`

---

## 5. Collection: `cities`

Stores canonical city records for onboarding, Explore, ranking, and display.

```ts
interface City {
  _id: string
  slug: string
  name: string
  displayName: string
  region: string | null
  country: string
  countryCode: string
  location: {
    lat: number
    lng: number
  }
  address: string | null
  aliases: string[]
  timezone: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
```

### Field notes

- `_id`: Primary key for the city record
- `slug`: Stable readable identifier like `hyderabad-in`
- `name`: Base city name
- `displayName`: Canonical UI label like `Hyderabad, Telangana, India`
- `region`: State or province
- `country` / `countryCode`: Canonical country fields
- `location`: Canonical lat/lng for the city
- `address`: Provider-formatted address when available
- `aliases`: Search aliases and alternate spellings
- `timezone`: Canonical timezone
- `isActive`: Whether the city should appear in autocomplete and selection UIs

### Indexes

- `by_slug -> ["slug"]`
- `by_name -> ["name"]`
- `by_country_name -> ["countryCode", "name"]`

---

## 6. Collection: `users`

The primary user profile document. This is heavily read, so it should stay compact and public-safe as much as practical.

```ts
interface User {
  _id: string
  clerkId: string
  email: string
  github: {
    id: number
    username: string
  }
  profile: {
    displayName: string
    fullName: string | null
    avatarUrl: string
    bio: string
    cityId: string
    buildStatus: BuildStatus
    primaryLanguages: string[]
    socialLinks: {
      github: string
      x: string | null
      linkedin: string | null
      bluesky: string | null
      website: string | null
    }
  }
  pinnedOwnedProjectIds: string[]
  stats: {
    followersCount: number
    followingCount: number
    projectsCount: number
    contributionsCount: number
    commentsCount: number
    likedCount: number
  }
  exploreConfig: {
    cityIds: string[]
    stackPrefs: string[]
  }
  appearInExplore: boolean
  notificationPrefs: {
    projectLikes: boolean
    updateLikes: boolean
    comments: boolean
    commentReplies: boolean
    newFollowers: boolean
    dms: boolean
    weeklyDigest: boolean
    contributorRecognized: boolean
  }
  githubLastSyncedAt: Date | null
  createdAt: Date
  updatedAt: Date
  deactivatedAt: Date | null
  deletedAt: Date | null
}
```

### Field notes

- `_id`: Primary key, typically aligned with Clerk identity
- `clerkId`: Auth lookup field
- `email`: User email; for stricter privacy separation this can later move to a private collection
- `github.id`: Stable GitHub numeric identity
- `github.username`: GitHub handle, synced over time if renamed
- `profile.cityId`: References `cities._id`
- `pinnedOwnedProjectIds`: Max 3 project IDs, only for projects owned by the user
- `stats.*`: Denormalized counters updated in write flows
- `exploreConfig.cityIds`: Additional cities selected for Explore
- `appearInExplore`: Global discoverability toggle

### Indexes

- `by_clerk_id -> ["clerkId"]`
- `by_github_id -> ["github.id"]`
- `by_city_id -> ["profile.cityId"]`
- `by_created_at -> ["createdAt"]`

---

## 7. Collection: `projects`

Stores every GitHub repo that has been added to Locatic.

```ts
interface Project {
  _id: string
  ownerId: string
  github: {
    repoId: number
    fullName: string
    ownerLogin: string
    ownerLoginKey: string
    name: string
    nameKey: string
    description: string | null
    githubUrl: string
    projectUrl: string | null
    primaryLanguage: string | null
    languages: Array<{ name: string; bytes: number }>
    topics: string[]
    stargazersCount: number
    lastCommitAt: Date
    lastMetadataSyncedAt: Date | null
    lastMetadataSyncAttemptedAt?: Date | null
    commitFrequency: CommitFrequency
    readmePreview: string | null
    readmeAssetBaseUrl: string | null
    readmeAssetRootUrl: string | null
    readmeLinkBaseUrl: string | null
    readmeLinkRootUrl: string | null
  }
  locatic: {
    isVisible: boolean
    tags: string[]
    likesCount: number
    commentsCount: number
    postsCount: number
  }
  ownerSnapshot: {
    displayName: string
    avatarUrl: string
    cityId: string
    cityName: string
    buildStatus: BuildStatus
  }
  topContributorsSnapshot: Array<{
    userId: string
    displayName: string
    avatarUrl: string
    commitCount: number
  }>
  contributorStats: {
    matchedCount: number
    lastSyncedAt: Date | null
    syncCadence: ContributorSyncCadence
  }
  addedToLocaticAt: Date
  updatedAt: Date
}
```

### Field notes

- `ownerId`: References `users._id`
- `github.repoId`: Stable GitHub repo identity, sufficient without an extra repo key
- `github.fullName`: Canonical `owner/repo`
- `github.projectUrl`: Live deployed project URL if available
- `github.lastMetadataSyncAttemptedAt`: Last attempted metadata refresh, used to make scheduled sync progress even when a repo fails.
- `github.readmePreview`: Cached README markdown preview. It can be `null` when GitHub has no README.
- `github.readmeAssetBaseUrl`, `github.readmeAssetRootUrl`, `github.readmeLinkBaseUrl`, `github.readmeLinkRootUrl`: Required nullable URL-base keys used to resolve relative README assets and links.
- `locatic.isVisible`: Owner-facing visibility toggle
- `ownerSnapshot`: Feed/card render cache
- `topContributorsSnapshot`: Small render cache only, not source of truth
- `contributorStats.lastSyncedAt`: Last contributor refresh time
- `contributorStats.syncCadence`: Refresh cadence based on repo activity

### Indexes

- `by_github_repo_id -> ["github.repoId"]`
- `by_full_name -> ["github.fullName"]`
- `by_github_route_visible -> ["github.ownerLoginKey", "github.nameKey", "locatic.isVisible"]`
- `by_visible_added -> ["locatic.isVisible", "addedToLocaticAt"]`
- `by_visible_metadata_synced -> ["locatic.isVisible", "github.lastMetadataSyncedAt"]`
- `by_visible_metadata_attempted -> ["locatic.isVisible", "github.lastMetadataSyncAttemptedAt"]`
- `by_owner -> ["ownerId"]`
- `by_owner_visible -> ["ownerId", "locatic.isVisible"]`
- `by_city_likes -> ["ownerSnapshot.cityId", "locatic.likesCount"]`
- `by_city_comments -> ["ownerSnapshot.cityId", "locatic.commentsCount"]`
- `by_city_added -> ["ownerSnapshot.cityId", "addedToLocaticAt"]`
- `by_sync_due -> ["contributorStats.syncCadence", "contributorStats.lastSyncedAt"]`

---

## 8. Collection: `project_contributors`

The source of truth for matched contribution relationships between Locatic users and Locatic projects.

```ts
interface ProjectContributor {
  _id: string
  projectId: string
  userId: string
  githubId: number
  githubUsername: string
  commitCount: number
  role: 'contributor'
  isActive: boolean
  firstMatchedAt: Date
  lastConfirmedAt: Date
  userSnapshot: {
    displayName: string
    avatarUrl: string
  }
}
```

### Field notes

- `projectId`: References `projects._id`
- `userId`: References `users._id`
- `githubId`: Stable GitHub user identifier used in matching workflows
- `commitCount`: Relative weight of contribution
- `isActive`: Whether the match is still valid
- `firstMatchedAt`: First time this contribution relationship was created
- `lastConfirmedAt`: Last sync that verified it
- `userSnapshot`: Small render cache for contributor strips

### Indexes

- `by_project -> ["projectId"]`
- `by_user -> ["userId"]`
- `by_project_user -> ["projectId", "userId"]`
- `by_github_id -> ["githubId"]`

---

## 9. Collection: `project_releases`

GitHub releases imported from the repository. These are distinct from Locatic-authored posts.

```ts
interface ProjectRelease {
  _id: string
  projectId: string
  githubReleaseId: number
  tagName: string
  name: string | null
  body: string | null
  htmlUrl: string
  isDraft: boolean
  isPrerelease: boolean
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
  importedAt: Date
}
```

### Field notes

- `projectId`: References `projects._id`
- `githubReleaseId`: Stable GitHub release identifier for dedupe/update
- `body`: GitHub-authored release notes, rendered separately from Locatic posts
- `importedAt`: Last successful import time for this release row

### Indexes

- `by_project_published -> ["projectId", "publishedAt"]`
- `by_project_release -> ["projectId", "githubReleaseId"]`

---

## 10. Collection: `reaction_config`

Defines valid reaction types and their UI metadata.

```ts
interface ReactionConfig {
  _id: string
  label: string
  emoji: string
  targetTypes: Array<'project' | 'post' | 'comment'>
  isActive: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}
```

### Field notes

- `_id`: Stable reaction key such as `like`, `fire`, `heart`, `rocket`
- `label`: Human-readable reaction label
- `emoji`: Unicode emoji used in UI
- `targetTypes`: Valid target entities for this reaction
- `isActive`: Allows soft-disable without breaking old rows
- `sortOrder`: Controls UI ordering

### Indexes

- `by_sort_order -> ["sortOrder"]`

---

## 11. Collection: `reactions`

Stores a user reaction against a project, post, or comment.

```ts
interface Reaction {
  _id: string
  userId: string
  targetType: 'project' | 'post' | 'comment'
  targetId: string
  reactionType: string
  createdAt: Date
}
```

### Field notes

- `userId`: References `users._id`
- `targetType`: Distinguishes project, post, and comment reactions
- `targetId`: References a project, post, or comment
- `reactionType`: References `reaction_config._id`

### Indexes

- `by_target -> ["targetType", "targetId"]`
- `by_user_target_type -> ["userId", "targetType", "reactionType"]`
- `by_user_target_reaction -> ["userId", "targetId", "reactionType"]`

### Notes

Logical uniqueness like “one reaction per user per target per reaction type” should be enforced in mutation logic.

---

## 12. Collection: `comments`

Public comment threads on projects and posts. Replies are one level deep.

```ts
interface Comment {
  _id: string
  targetType: 'project' | 'post'
  targetId: string
  authorId: string
  parentId: string | null
  content: string
  replyCount: number
  isDeleted: boolean
  authorSnapshot: {
    displayName: string
    avatarUrl: string
    cityId: string
    cityName: string
  }
  createdAt: Date
}
```

### Field notes

- `targetType` / `targetId`: Comment target
- `authorId`: References `users._id`
- `parentId`: Null for top-level, populated for replies
- `content`: Public text; replaced with `[deleted]` on soft delete
- `replyCount`: Denormalized direct reply count
- `isDeleted`: Soft delete flag

### Indexes

- `by_target_parent -> ["targetId", "parentId"]`
- `by_author -> ["authorId"]`

---

## 13. Collection: `follows`

Stores one-directional follow relationships.

```ts
interface Follow {
  _id: string
  followerId: string
  followingId: string
  createdAt: Date
}
```

### Field notes

- `followerId`: User doing the follow
- `followingId`: User being followed

### Indexes

- `by_follower -> ["followerId"]`
- `by_following -> ["followingId"]`
- `by_pair -> ["followerId", "followingId"]`

---

## 14. Collection: `activity_events`

Source event log for meaningful social and content activity.

```ts
interface ActivityEvent {
  _id: string
  actorId: string
  eventType: EventType
  projectId: string | null
  postId: string | null
  commentId: string | null
  actorSnapshot: {
    displayName: string
    avatarUrl: string
    cityId: string
    cityName: string
  }
  projectSnapshot: {
    name: string
    fullName: string
    description: string | null
    primaryLanguage: string | null
    likesCount: number
    commentsCount: number
  } | null
  postSnapshot: {
    body: string
    reactionCounts: Record<string, number>
    commentsCount: number
  } | null
  target?: HomeFeedTarget
  createdAt: Date
}
```

`HomeFeedTarget` comment variants may include `rootCommentId` and
`ancestorCommentIds` so Home can deep-link replies by opening the root thread
and expanding the ancestor path.

### Field notes

- `actorId`: User who generated the event
- `eventType`: Type of activity
- `projectId`: Populated for project-backed activity; null for profile-only events such as follows
- `postId`: Populated for post-related activity
- `commentId`: Populated for comment-related activity
- `actorSnapshot`: Feed render cache
- `projectSnapshot`: Feed render cache
- `postSnapshot`: Feed render cache for post events
- `target`: Typed render/navigation target snapshot for Home feed rows

### Indexes

- `by_actor -> ["actorId"]`
- `by_actor_created_at -> ["actorId", "createdAt"]`
- `by_project_event -> ["projectId", "eventType"]`
- `by_created_at -> ["createdAt"]`

---

## 15. Collection: `home_feed_items`

Materialized Home feed read model. This is the collection queried by the Home page.

```ts
interface HomeFeedItem {
  _id: string
  userId: string
  sourceEventId: string
  dedupeKey: string
  reason: FeedReason
  priority: 1 | 2 | 3
  actorId: string
  eventType: EventType
  projectId: string | null
  postId: string | null
  actorSnapshot: {
    displayName: string
    avatarUrl: string
    cityId: string
    cityName: string
  }
  projectSnapshot: {
    name: string
    fullName: string
    description: string | null
    primaryLanguage: string | null
    likesCount: number
    commentsCount: number
  } | null
  postSnapshot: {
    body: string
    reactionCounts: Record<string, number>
    commentsCount: number
  } | null
  rowKind?: 'single_event' | 'event_group'
  groupKey?: string
  groupKind?: EventType
  eventCount?: number
  firstEventAt?: Date
  latestEventAt?: Date
  sourceEventIds?: string[]
  target?: HomeFeedTarget
  previewTargets?: HomeFeedTarget[]
  createdAt: Date
}
```

### Field notes

- `userId`: Recipient of this feed item
- `sourceEventId`: References `activity_events._id`
- `dedupeKey`: Used to avoid duplicate feed rows for the same recipient context
- `reason`: Why the item exists for this user
- `priority`: Feed ranking group
- `groupKey`: Same-actor same-UTC-day grouping key used by feed upserts
- `eventCount`: Total events represented by a grouped row
- `firstEventAt` / `latestEventAt`: Range for softer grouped time copy
- `sourceEventIds`: Bounded recent source-event dedupe for grouped rows
- `target`: Primary target snapshot
- `previewTargets`: Capped preview rows for multi-target groups; collapsed UI shows three rows

### Indexes

- `by_user_priority -> ["userId", "priority"]`
- `by_user_created -> ["userId", "createdAt"]`
- `by_user_dedupe -> ["userId", "dedupeKey"]`
- `by_user_group_key -> ["userId", "groupKey"]`

---

## 16. Collection: `conversations`

One DM thread per pair of users.

```ts
interface Conversation {
  _id: string
  conversationKey: string
  participantLowId: string
  participantHighId: string
  lastMessage: {
    content: string
    senderId: string
    sentAt: Date
  }
  unreadCounts: Record<string, number>
  isRequest: boolean
  createdAt: Date
  updatedAt: Date
}
```

### Field notes

- `conversationKey`: Deterministic sorted-pair key, useful here and worth keeping
- `participantLowId` / `participantHighId`: Sorted participant IDs
- `lastMessage`: Inbox preview cache
- `unreadCounts`: Per-user unread counters
- `isRequest`: Whether the DM started as a request

### Indexes

- `by_conversation_key -> ["conversationKey"]`
- `by_participant_low_updated -> ["participantLowId", "updatedAt"]`
- `by_participant_high_updated -> ["participantHighId", "updatedAt"]`

---

## 17. Collection: `messages`

Individual messages inside a DM conversation.

```ts
interface Message {
  _id: string
  conversationId: string
  senderId: string
  content: string
  readAt: Date | null
  createdAt: Date
}
```

### Field notes

- `conversationId`: References `conversations._id`
- `senderId`: References `users._id`
- `content`: Message body
- `readAt`: Null until recipient reads it

### Indexes

- `by_conversation -> ["conversationId"]`

---

## 18. Collection: `notifications`

Recipient-specific notification records for in-app alerts.

```ts
interface Notification {
  _id: string
  recipientId: string
  actorId: string
  type: NotificationType
  projectId: string | null
  postId: string | null
  commentId: string | null
  actorSnapshot: {
    displayName: string
    avatarUrl: string
  }
  projectName: string | null
  isRead: boolean
  createdAt: Date
}
```

### Field notes

- `recipientId`: User who receives the notification
- `actorId`: User who triggered the event
- `type`: Notification category
- `projectId` / `postId` / `commentId`: Optional context fields
- `actorSnapshot`: Render cache for the notification row
- `projectName`: Small display helper
- `isRead`: Read state

### Indexes

- `by_recipient_read -> ["recipientId", "isRead"]`
- `by_recipient_created -> ["recipientId", "createdAt"]`

---

## 19. Collection: `github_sync_log`

Audit trail for GitHub sync activity.

```ts
interface GithubSyncLog {
  _id: string
  userId: string
  syncType:
    | 'initial'
    | 'manual'
    | 'metadata'
    | 'readme'
    | 'contributors'
    | 'releases'
    | 'scheduled'
  reposFetched: number
  reposNew: number
  reposUpdated: number
  status: 'success' | 'failed' | 'token_revoked'
  error: string | null
  githubRateLimitRemaining: number | null
  syncedAt: Date
}
```

### Field notes

- `userId`: References `users._id`
- `syncType`: Import, refresh, backfill, contributor, release, or scheduled sync category
- `reposFetched` / `reposNew` / `reposUpdated`: Sync counts
- `status`: Final sync result
- `error`: Failure detail if any
- `githubRateLimitRemaining`: Captured rate limit state

### Indexes

- `by_user_synced_at -> ["userId", "syncedAt"]`

---

## 20. Collection: `contributor_sync_config`

Singleton configuration for contributor refresh jobs.

```ts
interface ContributorSyncConfig {
  _id: 'contributor_sync_config'
  cadences: {
    dailyIntervalHours: number
    weeklyIntervalHours: number
    monthlyIntervalHours: number
  }
  maxContributorsFetched: number
  maxTopContributorsStored: number
  lastRunAt: Date | null
  updatedAt: Date
}
```

### Field notes

- `_id`: Singleton document key
- `cadences`: Time windows for sync job scheduling
- `maxContributorsFetched`: Raw contributor fetch cap
- `maxTopContributorsStored`: Render-cache cap for project cards
- `lastRunAt`: Last successful job run

---

## 21. Keys Worth Keeping

Only keep keys that solve a real identity or dedupe problem.

### Keep

- `cities.slug`
- `home_feed_items.dedupeKey`
- `conversations.conversationKey`

### Skip

- `githubRepoKey`
- `reactionKey`
- `followKey`

### Rationale

- `slug` is useful for city identity and search
- `dedupeKey` is useful for feed materialization and repeat suppression
- `conversationKey` is useful because one DM thread per pair is a real business rule
- the others are not necessary because existing natural fields already define the record clearly enough

---

## 22. Operational Notes

- Query the Home page from `home_feed_items`, not from `activity_events` using followed-user `IN` logic
- Treat `activity_events` as the source event log and `home_feed_items` as the read model
- Treat `project_contributors` as the source of truth for contribution relationships
- Keep `topContributorsSnapshot`, `ownerSnapshot`, `actorSnapshot`, and similar objects as render caches only
- Enforce logical uniqueness such as follows and reactions in mutation logic
- Use scheduled cleanup for stale feed items, notifications, and old event history

---

## 23. Next Implementation Steps

1. Convert this document into Convex validators and table indexes in `convex/schema.ts`
2. Define mutation-level uniqueness rules for follows, reactions, and conversations
3. Implement fan-out write flows into `home_feed_items`
4. Add scheduled jobs for contributor refresh, GitHub sync maintenance, and cleanup
