export type ContributionsPrivacy = {
  contributionsVisibility?: 'public' | 'private'
}

export function isContributionsVisibleOnPublicProfile(
  privacy: ContributionsPrivacy,
) {
  return privacy.contributionsVisibility !== 'private'
}

type ProfileAccessFields = {
  deletedAt?: number | null
  deactivatedAt?: number | null
  privacy: { profileVisibility: 'public' | 'locatic_only' }
}

/** A gone account's profile is closed to everyone. */
export function isProfileGone(user: ProfileAccessFields) {
  return Boolean(user.deletedAt || user.deactivatedAt)
}

/**
 * Whether a signed-out visitor can open /u/<username>. Signed-in members can
 * also open `locatic_only` profiles.
 */
export function isProfileOpenToSignedOutVisitors(user: ProfileAccessFields) {
  return !isProfileGone(user) && user.privacy.profileVisibility === 'public'
}
