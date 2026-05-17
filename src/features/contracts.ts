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
  pinnedOwnedProjectIds: Doc<'users'>['pinnedOwnedProjectIds']
  onboardingCompletedAt: Doc<'users'>['onboardingCompletedAt']
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
  likedProjects: Array<{
    reactionId: Id<'reactions'>
    projectId: Id<'projects'>
    likedAt: number
    project: Doc<'projects'>
  }>
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
  likedProjects: Array<{
    reactionId: Id<'reactions'>
    projectId: Id<'projects'>
    fullName: string
    name: string
    likedAt: number
  }>
  privacy: Doc<'users'>['privacy']
}

export type ProjectDetailPayload = {
  project: Doc<'projects'>
  updates: Array<Doc<'updates'>>
  comments: Array<Doc<'comments'>>
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
    id: viewer._id,
    notificationPrefs: viewer.notificationPrefs,
    onboardingCompletedAt: viewer.onboardingCompletedAt,
    pinnedOwnedProjectIds: viewer.pinnedOwnedProjectIds,
    privacy: viewer.privacy,
    socialLinks: viewer.profile.socialLinks,
    stats: viewer.stats,
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
    likedProjects: payload.likedProjects,
    projects: payload.projects,
    viewer: mapViewer(payload.viewer, payload.cityName),
  }
}

export function mapPublicProfile(
  payload: PublicProfilePayload | null | undefined,
) {
  if (!payload) return null

  return {
    comments: payload.comments,
    githubUsername: payload.githubUsername,
    likedProjects: payload.likedProjects,
    privacy: payload.privacy,
    profile: payload.profile,
    projects: payload.projects,
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
  return payload ?? []
}

export function mapConversationDetail(
  payload: ConversationDetailPayload | undefined,
) {
  return payload ?? null
}

export function mapNotifications(
  payload: Array<Doc<'notifications'>> | undefined,
) {
  return payload ?? []
}
