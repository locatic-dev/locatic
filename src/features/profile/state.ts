import type { ProfileSocialPagePayload } from '@/features/contracts'

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
  count: number | null
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

export function emptySocialPage(): ProfileSocialPagePayload {
  return {
    continueCursor: '',
    isDone: true,
    page: [],
    pageStatus: null,
    splitCursor: null,
  }
}

/** Appends a follow-graph page, replacing rows already loaded for a user. */
export function mergeSocialItems<TItem extends { userId: string }>(
  current: TItem[],
  nextItems: TItem[],
) {
  const itemsById = new Map(current.map((item) => [String(item.userId), item]))

  for (const item of nextItems) {
    itemsById.set(String(item.userId), item)
  }

  return [...itemsById.values()]
}

type LanguageWeightSource = {
  projectId: string
  languages: Array<{ name: string; bytes: number }>
}

const PROFILE_LANGUAGE_LIMIT = 6

/**
 * Languages across the projects shown on a profile, weighted by bytes and
 * counted once per project, largest first.
 */
export function summarizeProfileLanguages(
  projects: readonly LanguageWeightSource[],
  limit = PROFILE_LANGUAGE_LIMIT,
) {
  const seenProjects = new Set<string>()
  const bytesByLanguage = new Map<string, number>()

  for (const project of projects) {
    if (seenProjects.has(String(project.projectId))) {
      continue
    }
    seenProjects.add(String(project.projectId))

    for (const language of project.languages) {
      if (!language.name || language.bytes <= 0) {
        continue
      }
      bytesByLanguage.set(
        language.name,
        (bytesByLanguage.get(language.name) ?? 0) + language.bytes,
      )
    }
  }

  return [...bytesByLanguage.entries()]
    .map(([name, bytes]) => ({ name, bytes }))
    .sort((left, right) => right.bytes - left.bytes)
    .slice(0, limit)
}

/**
 * The pin toggle on an owner's project card. Its accessible name starts with
 * the visible label (WCAG 2.5.3) and names the project, so each card's toggle
 * is distinguishable in a list of buttons.
 */
export function getPinToggleCopy({
  isPinned,
  pending,
  repo,
}: {
  isPinned: boolean
  pending: boolean
  repo: string
}) {
  if (pending) {
    return { label: 'saving…', accessibleName: `saving ${repo}` }
  }

  return isPinned
    ? { label: 'pinned', accessibleName: `pinned ${repo}, unpin` }
    : { label: 'pin', accessibleName: `pin ${repo}` }
}
