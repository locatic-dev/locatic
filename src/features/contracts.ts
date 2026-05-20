import type { Doc, Id } from '../../convex/_generated/dataModel'

export type ViewerRecord = {
  _id: Id<'users'>
  appearInExplore: boolean
  github: Doc<'users'>['github']
  profile: Doc<'users'>['profile']
  stats: Doc<'users'>['stats']
  exploreConfig: Doc<'users'>['exploreConfig']
  privacy: Doc<'users'>['privacy']
  notificationPrefs: Doc<'users'>['notificationPrefs']
  onboardingSelectedOwnedProjectIds: Array<Id<'projects'>>
  pinnedProfileProjectIds: Array<Id<'projects'>>
  syncGithubStarsOnLike: boolean
  unreadMessagesCount: number
  onboardingCompletedAt: Doc<'users'>['onboardingCompletedAt']
  githubContributions?: Doc<'users'>['githubContributions']
}

export type ProfileSocialPreview = {
  userId: Id<'users'>
  githubUsername: string
  displayName: string
  avatarUrl: string | null
  cityName: string | null
}

export type ContributedProjectPreview = {
  project: Doc<'projects'>
  commitCount: number
}

export type ViewerBootstrapPayload = {
  isAuthenticated: boolean
  needsOnboarding: boolean
  viewer: ViewerRecord | null
}

export type PrivateProfilePayload = {
  viewer: ViewerRecord
  cityName: string | null
  projects: Array<Doc<'projects'>>
  comments: Array<Doc<'comments'>>
  contributions: Array<ContributedProjectPreview>
  followers: Array<ProfileSocialPreview>
  likedProjects: Array<{
    reactionId: Id<'reactions'>
    projectId: Id<'projects'>
    likedAt: number
    project: Doc<'projects'>
  }>
  following: Array<ProfileSocialPreview>
}

export type PrivateProfileOverviewPayload = {
  viewer: ViewerRecord
  cityName: string | null
}

export type ViewerSummaryPayload = {
  viewerId: Id<'users'>
}

export type ViewerLikedProjectIdsPayload = {
  viewerId: Id<'users'>
  likedProjectIds: Array<Id<'projects'>>
}

export type ViewerExplorePrefsPayload = {
  viewerId: Id<'users'>
  appearInExplore: boolean
  cityId: Id<'cities'> | null
  cityName: string | null
  exploreConfig: Doc<'users'>['exploreConfig']
}

export type ViewerInboxSummaryPayload = {
  viewerId: Id<'users'>
  unreadMessages: number
}

export type ProfileSocialPagePayload = {
  page: Array<ProfileSocialPreview>
  continueCursor: string
  isDone: boolean
  pageStatus?: 'SplitRecommended' | 'SplitRequired' | null
  splitCursor?: string | null
}

export type PublicProfilePayload = {
  userId: Id<'users'>
  viewerFollowsProfile: boolean
  githubUsername: string
  profile: {
    displayName: string
    bio: string
    avatarUrl: string
    buildStatus: Doc<'users'>['profile']['buildStatus']
    socialLinks: Doc<'users'>['profile']['socialLinks']
    city: string | null
  }
  stats: Doc<'users'>['stats']
  githubContributions?: Doc<'users'>['githubContributions'] | null
  projects: Array<Doc<'projects'>>
  comments: Array<{
    _id: Id<'comments'>
    targetType: Doc<'comments'>['targetType']
    targetId: string
    content: string
    replyCount: number
    likesCount: number
    createdAt: number
  }>
  contributions: Array<ContributedProjectPreview>
  followers: Array<ProfileSocialPreview>
  likedProjects: Array<{
    reactionId: Id<'reactions'>
    projectId: Id<'projects'>
    fullName: string
    name: string
    likedAt: number
  }>
  following: Array<ProfileSocialPreview>
  privacy: Doc<'users'>['privacy']
}

export type PublicProfileOverviewPayload = {
  userId: Id<'users'>
  viewerFollowsProfile: boolean
  githubUsername: string
  profile: {
    displayName: string
    bio: string
    avatarUrl: string
    buildStatus: Doc<'users'>['profile']['buildStatus']
    socialLinks: Doc<'users'>['profile']['socialLinks']
    city: string | null
  }
  stats: Doc<'users'>['stats']
  githubContributions?: Doc<'users'>['githubContributions'] | null
  privacy: Doc<'users'>['privacy']
}

export type ThreadedProjectComment = Doc<'comments'> & {
  viewerHasLiked: boolean
  replies: Array<
    Doc<'comments'> & {
      viewerHasLiked: boolean
    }
  >
}

export type ProjectDetailPayload = {
  project: Doc<'projects'>
  updates: Array<Doc<'updates'>>
  comments: Array<ThreadedProjectComment>
  viewerHasLiked: boolean
  viewerFollowsOwner: boolean
  owner: {
    userId: Id<'users'>
    githubUsername: string
    displayName: string
    avatarUrl: string
    socialLinks: Doc<'users'>['profile']['socialLinks']
    buildStatus: Doc<'users'>['profile']['buildStatus']
    city: string | null
  }
}

export type NotificationTarget = {
  kind: 'profile' | 'project' | 'conversation'
  username: string | null
  projectFullName: string | null
  conversationId: Id<'conversations'> | null
  inboxTab?: 'inbox' | 'requests' | null
  commentId: Id<'comments'> | null
}

export type NotificationRecord = Doc<'notifications'> & {
  target?: NotificationTarget | null
}

export type EnrichedConversation = Doc<'conversations'> & {
  otherUser: {
    userId: Id<'users'>
    githubUsername: string
    displayName: string
    avatarUrl: string
    cityName: string | null
  } | null
}

export type ConversationDetailPayload = {
  conversation: EnrichedConversation
  messages: Array<Doc<'messages'>>
}

export function compactDisplayName(
  displayName: string | null | undefined,
  fallback: string,
) {
  const trimmed = displayName?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : fallback
}

export function mapViewer(
  viewer: ViewerRecord,
  cityName: string | null = null,
) {
  return {
    avatarUrl: viewer.profile.avatarUrl,
    appearInExplore: viewer.appearInExplore,
    bio: viewer.profile.bio,
    buildStatus: viewer.profile.buildStatus,
    cityId: viewer.profile.cityId,
    cityName,
    displayName: compactDisplayName(
      viewer.profile.displayName,
      viewer.github.username,
    ),
    exploreConfig: viewer.exploreConfig,
    githubUsername: viewer.github.username,
    githubContributions: viewer.githubContributions ?? null,
    id: viewer._id,
    notificationPrefs: viewer.notificationPrefs,
    onboardingCompletedAt: viewer.onboardingCompletedAt,
    onboardingSelectedOwnedProjectIds: viewer.onboardingSelectedOwnedProjectIds,
    pinnedProfileProjectIds: viewer.pinnedProfileProjectIds,
    privacy: viewer.privacy,
    socialLinks: viewer.profile.socialLinks,
    stats: viewer.stats,
    syncGithubStarsOnLike: viewer.syncGithubStarsOnLike,
    unreadMessagesCount: viewer.unreadMessagesCount,
  }
}

export function mapViewerBootstrap(
  payload: ViewerBootstrapPayload | undefined,
) {
  if (!payload) return null

  return {
    isAuthenticated: payload.isAuthenticated,
    needsOnboarding: payload.needsOnboarding,
    viewer: payload.viewer ? mapViewer(payload.viewer) : null,
  }
}

export function mapPrivateProfile(payload: PrivateProfilePayload | undefined) {
  if (!payload) return null

  return {
    comments: payload.comments,
    contributions: payload.contributions,
    followers: payload.followers,
    following: payload.following,
    likedProjects: payload.likedProjects,
    projects: payload.projects,
    viewer: mapViewer(payload.viewer, payload.cityName),
  }
}

export function mapPrivateProfileOverview(
  payload: PrivateProfileOverviewPayload | undefined,
) {
  if (!payload) return null

  return {
    viewer: mapViewer(payload.viewer, payload.cityName),
  }
}

export function mapViewerSummary(payload: ViewerSummaryPayload | undefined) {
  if (!payload) return null

  return {
    id: payload.viewerId,
  }
}

export function mapViewerLikedProjectIds(
  payload: ViewerLikedProjectIdsPayload | undefined,
) {
  if (!payload) return null

  return payload
}

export function mapViewerExplorePrefs(
  payload: ViewerExplorePrefsPayload | undefined,
) {
  if (!payload) return null

  return payload
}

export function mapViewerInboxSummary(
  payload: ViewerInboxSummaryPayload | undefined,
) {
  if (!payload) return null

  return payload
}

export function mapPublicProfile(
  payload: PublicProfilePayload | null | undefined,
) {
  if (!payload) return null

  return {
    comments: payload.comments,
    contributions: payload.contributions,
    followers: payload.followers,
    githubUsername: payload.githubUsername,
    githubContributions: payload.githubContributions ?? null,
    following: payload.following,
    likedProjects: payload.likedProjects,
    privacy: payload.privacy,
    profile: payload.profile,
    projects: payload.projects,
    stats: payload.stats,
    userId: payload.userId,
    viewerFollowsProfile: payload.viewerFollowsProfile,
  }
}

export function mapPublicProfileOverview(
  payload: PublicProfileOverviewPayload | null | undefined,
) {
  if (!payload) return null

  return {
    githubUsername: payload.githubUsername,
    githubContributions: payload.githubContributions ?? null,
    privacy: payload.privacy,
    profile: payload.profile,
    stats: payload.stats,
    userId: payload.userId,
    viewerFollowsProfile: payload.viewerFollowsProfile,
  }
}

export function mapProjectDetail(
  payload: ProjectDetailPayload | null | undefined,
) {
  if (!payload) return null

  return {
    comments: payload.comments,
    owner: payload.owner,
    project: payload.project,
    updates: payload.updates,
    viewerFollowsOwner: payload.viewerFollowsOwner,
    viewerHasLiked: payload.viewerHasLiked,
  }
}

export function mapConversationList(
  payload: Array<EnrichedConversation> | undefined,
) {
  return payload
}

export function mapConversationDetail(
  payload: ConversationDetailPayload | undefined,
) {
  return payload ?? null
}

export function mapNotifications(
  payload: Array<NotificationRecord> | undefined,
) {
  return payload
}
