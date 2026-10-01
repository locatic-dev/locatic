import type { Id } from '../_generated/dataModel'
import type { Doc } from './types'
import type { DatabaseReader, DatabaseWriter } from '../_generated/server'
import { resolveProjectOwnerLogin } from './project_route'
import {
  getMemberCityId,
  resolveLocationDisclosure,
  toSnapshotLocation,
  type SnapshotLocation,
} from './visibility'

type Reader = DatabaseReader | DatabaseWriter

/**
 * Owner/actor location as the visibility policy discloses it: `cityId` only
 * for exact-city members, `cityName` the city name for members, the region
 * label for region-only users, null for hidden users.
 */
export async function buildSnapshotLocation(
  db: Reader,
  user: Doc<'users'>,
): Promise<SnapshotLocation> {
  const city = user.profile.cityId ? await db.get(user.profile.cityId) : null
  return toSnapshotLocation(resolveLocationDisclosure(user, city))
}

export async function buildActorSnapshot(db: Reader, user: Doc<'users'>) {
  const location = await buildSnapshotLocation(db, user)
  return {
    displayName: user.profile.displayName,
    avatarUrl: user.profile.avatarUrl,
    cityId: location.cityId,
    cityName: location.cityName,
  }
}

export async function buildOwnerSnapshot(db: Reader, user: Doc<'users'>) {
  const location = await buildSnapshotLocation(db, user)
  return {
    displayName: user.profile.displayName,
    avatarUrl: user.profile.avatarUrl,
    cityId: location.cityId,
    cityName: location.cityName,
    buildStatus: user.profile.buildStatus,
  }
}

/**
 * `exploreOwner.cityId` is the owner's member city (null for region-only and
 * hidden owners), so the city indexes only hold members' projects. Global
 * eligibility depends on discovery participation, not on location
 * disclosure: a hidden owner with `appearInExplore` stays globally eligible.
 */
export function buildProjectExploreOwner(
  user: Doc<'users'>,
  isVisible: boolean,
) {
  const isOwnerActive = !user.deletedAt && !user.deactivatedAt
  const hasCity = user.profile.cityId !== null

  return {
    cityId: getMemberCityId(user),
    appearInExplore: user.appearInExplore,
    isActive: isOwnerActive,
    isEligible: isVisible && isOwnerActive && user.appearInExplore && hasCity,
  }
}

/**
 * Live counterpart of `exploreOwner.isEligible` for a visible project: the
 * owner is active, takes part in discovery and has a profile city. Read
 * paths use it to check the live owner when a stored `exploreOwner` could
 * predate the owner's latest change.
 */
export function isOwnerDiscoverable(owner: Doc<'users'>): boolean {
  return buildProjectExploreOwner(owner, true).isEligible
}

/**
 * `posts.projectCityId`, the city index key of posts about an owner's
 * projects: the owner's member city while the owner is discoverable, else
 * null, so city post indexes never hold posts of owners who left discovery
 * or stopped disclosing their exact city. Project visibility is not folded
 * in (hidden projects' posts fail the read-time visibility check), so a
 * project turning hidden or visible never rewrites its posts.
 */
export function getPostCityId(owner: Doc<'users'>): Id<'cities'> | null {
  const exploreOwner = buildProjectExploreOwner(owner, true)
  return exploreOwner.isEligible ? exploreOwner.cityId : null
}

export function buildProjectSnapshot(project: Doc<'projects'>) {
  return {
    name: project.github.name,
    fullName: project.github.fullName,
    ownerLogin: resolveProjectOwnerLogin(project),
    description: project.github.description,
    primaryLanguage: project.github.primaryLanguage,
    languages: project.github.languages,
    likesCount: project.locatic.likesCount,
    commentsCount: project.locatic.commentsCount,
    stargazersCount: project.github.stargazersCount,
    ownerId: project.ownerId,
    ownerDisplayName: project.ownerSnapshot.displayName,
    ownerAvatarUrl: project.ownerSnapshot.avatarUrl,
    cityId: project.ownerSnapshot.cityId,
    cityName: project.ownerSnapshot.cityName,
  }
}

export function buildPostSnapshot(post: Doc<'posts'>) {
  return {
    body: post.body,
    reactionCounts: post.reactionCounts,
    commentsCount: post.commentsCount,
  }
}

export function buildProfileTargetSnapshot(
  user: Doc<'users'>,
  cityName: string | null = null,
) {
  return {
    userId: user._id,
    githubUsername: user.github.username,
    displayName: user.profile.displayName,
    avatarUrl: user.profile.avatarUrl,
    cityName,
  }
}
