export const PROFILE_CONTENT_TAB_VALUES = [
  'projects',
  'posts',
  'contributions',
  'comments',
  'liked',
] as const

export const PROFILE_NETWORK_TAB_VALUES = ['followers', 'following'] as const

export type ProfileContentTab = (typeof PROFILE_CONTENT_TAB_VALUES)[number]
export type ProfileNetworkTab = (typeof PROFILE_NETWORK_TAB_VALUES)[number]

export type ProfileSearch = {
  tab: ProfileContentTab
  network?: ProfileNetworkTab
}

type ProfileTabLike = {
  count: number
  id: string
  label: string
}

type ContributionsPrivacyLike = {
  contributionsVisibility?: 'public' | 'private'
}

export function isProfileContributionsPublic(
  privacy: ContributionsPrivacyLike,
) {
  return privacy.contributionsVisibility !== 'private'
}

export function normalizeProfileSearch(
  search: Record<string, unknown>,
): ProfileSearch {
  const rawTab = search.tab
  const rawNetwork = search.network

  const network: ProfileNetworkTab =
    rawNetwork === 'following' ? 'following' : 'followers'

  if (rawTab === 'followers' || rawTab === 'following') {
    return {
      network: rawTab,
      tab: 'projects',
    }
  }

  return {
    network,
    tab:
      rawTab === 'posts' ||
      rawTab === 'contributions' ||
      rawTab === 'comments' ||
      rawTab === 'liked'
        ? rawTab
        : 'projects',
  }
}

export function isProfileContentTab(value: string): value is ProfileContentTab {
  return PROFILE_CONTENT_TAB_VALUES.includes(value as ProfileContentTab)
}

export function getProfileContentTabs<TTab extends ProfileTabLike>(
  tabs: TTab[],
) {
  return tabs.filter((tab) => isProfileContentTab(tab.id))
}

export function getVisibleProfileContentTabs<TTab extends ProfileTabLike>(
  tabs: TTab[],
  options: { showContributions: boolean },
) {
  return getProfileContentTabs(tabs).filter(
    (tab) => options.showContributions || tab.id !== 'contributions',
  )
}

export function getVisibleProfileContentTab(
  tab: ProfileContentTab,
  options: { showContributions: boolean },
): ProfileContentTab {
  if (tab === 'contributions' && !options.showContributions) {
    return 'projects'
  }

  return tab
}
