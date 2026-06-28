export type ContributionsPrivacy = {
  contributionsVisibility?: 'public' | 'private'
}

export function isContributionsVisibleOnPublicProfile(
  privacy: ContributionsPrivacy,
) {
  return privacy.contributionsVisibility !== 'private'
}
