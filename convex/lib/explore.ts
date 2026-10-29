import type { PaginationResult } from 'convex/server'

import { normalizeProjectTopic } from './topics'

export type ExploreProjectStackCandidate = {
  github: {
    languages?: Array<{
      name: string
    }>
    lastCommitAt: number
    primaryLanguage: string | null
  }
}

type ExploreProjectVisibilityCandidate<TProjectId, TCityId> = {
  _id: TProjectId
  ownerId: unknown
  exploreOwner: {
    cityId: TCityId | null
  }
}

type ExplorePostScopeCandidate<TPostId, TCityId> = {
  _id: TPostId
  projectCityId: TCityId | null
}

type NearbyBuilderVisibilityCandidate<TUserId, TCityId> = {
  _id: TUserId
  profile: {
    cityId: TCityId | null
  }
}

/**
 * Applies viewer-specific filters (ownership, dismissal, visibility) to one
 * Convex page. Convex allows a single `.paginate()` per function execution,
 * so a feed query reads exactly one page and returns its continuation
 * unchanged: a page may filter down to nothing while `isDone` is still false,
 * and the client decides whether to fetch the next page.
 */
export async function filterExplorePage<TItem, TVisible = TItem>(
  result: PaginationResult<TItem>,
  getVisibleItems: (items: TItem[]) => TVisible[] | Promise<TVisible[]>,
): Promise<PaginationResult<TVisible>> {
  return { ...result, page: await getVisibleItems(result.page) }
}

export function getExploreCityIdsAfterProfileCityChange<TCityId>({
  nextProfileCityId,
  previousExploreCityIds,
  previousProfileCityId,
}: {
  nextProfileCityId: TCityId | null
  previousExploreCityIds: TCityId[]
  previousProfileCityId: TCityId | null
}): TCityId[] {
  const previousProfileCityKey =
    previousProfileCityId === null ? null : String(previousProfileCityId)
  const previousExploreCityKeys = previousExploreCityIds.map((cityId) =>
    String(cityId),
  )
  const wasProfileDerived =
    previousExploreCityKeys.length === 0 ||
    (previousExploreCityKeys.length === 1 &&
      previousProfileCityKey !== null &&
      previousExploreCityKeys[0] === previousProfileCityKey)

  if (!wasProfileDerived) {
    return previousExploreCityIds
  }

  return nextProfileCityId === null ? [] : [nextProfileCityId]
}

/**
 * Whether a project from an Explore page belongs in the feed. The viewer's own
 * projects never appear among the ranked rows (they are appended after them
 * in an explicitly selected city, see `selectViewerCityProjects`); visitors
 * pass a null `viewerId` and an empty dismissal set.
 */
export function isExploreProjectVisible<TProjectId, TCityId>({
  dismissedProjectIds,
  project,
  selectedCityIdSet,
  selectedCityCount,
  viewerId,
}: {
  dismissedProjectIds: Set<string>
  project: ExploreProjectVisibilityCandidate<TProjectId, TCityId>
  selectedCityCount: number
  selectedCityIdSet: Set<string>
  viewerId: string | null
}) {
  if (viewerId !== null && String(project.ownerId) === viewerId) return false
  if (dismissedProjectIds.has(String(project._id))) return false

  return (
    selectedCityCount <= 1 ||
    (project.exploreOwner.cityId !== null &&
      selectedCityIdSet.has(String(project.exploreOwner.cityId)))
  )
}

/**
 * Largest page an Explore feed reads per execution. `paginationOptsValidator`
 * accepts any `numItems`, and these feeds are public, so the helpers clamp
 * it before `.paginate()` to keep one execution's reads bounded.
 */
export const EXPLORE_PAGE_MAX_ITEMS = 50

/** The caller's pagination options with `numItems` clamped to 1..50. */
export function clampExplorePaginationOpts<TOpts extends { numItems: number }>(
  paginationOpts: TOpts,
): TOpts {
  const numItems = Number.isFinite(paginationOpts.numItems)
    ? Math.floor(paginationOpts.numItems)
    : EXPLORE_PAGE_MAX_ITEMS
  return {
    ...paginationOpts,
    numItems: Math.min(Math.max(numItems, 1), EXPLORE_PAGE_MAX_ITEMS),
  }
}

/** Most own projects appended to an explicitly selected city's feed. */
export const VIEWER_CITY_PROJECT_LIMIT = 10

type ViewerCityProjectCandidate<TCityId> = {
  exploreOwner: { cityId: TCityId | null; isEligible: boolean }
  github: { lastCommitAt: number }
}

/**
 * Own projects shown in an explicitly selected city: only in
 * `custom` scope, only once the city's ranked rows are exhausted (`isDone`),
 * so they always come after other builders' projects; only eligible projects
 * whose Explore city is one of the selected cities; newest commit first.
 */
export function selectViewerCityProjects<
  TProject extends ViewerCityProjectCandidate<TCityId>,
  TCityId,
>({
  isDone,
  projects,
  scope,
  selectedCityIdSet,
}: {
  isDone: boolean
  projects: TProject[]
  scope: 'default' | 'global' | 'custom'
  selectedCityIdSet: Set<string>
}): TProject[] {
  if (scope !== 'custom' || !isDone || selectedCityIdSet.size === 0) return []

  return projects
    .filter(
      (project) =>
        project.exploreOwner.isEligible &&
        project.exploreOwner.cityId !== null &&
        selectedCityIdSet.has(String(project.exploreOwner.cityId)),
    )
    .sort((left, right) => right.github.lastCommitAt - left.github.lastCommitAt)
}

export function isExplorePostInScope<TPostId, TCityId>({
  dismissedPostIds,
  post,
  selectedCityIdSet,
  selectedCityCount,
}: {
  dismissedPostIds: Set<string>
  post: ExplorePostScopeCandidate<TPostId, TCityId>
  selectedCityCount: number
  selectedCityIdSet: Set<string>
}) {
  if (dismissedPostIds.has(String(post._id))) return false

  return (
    selectedCityCount <= 1 ||
    (post.projectCityId !== null &&
      selectedCityIdSet.has(String(post.projectCityId)))
  )
}

export function isNearbyBuilderVisible<TUserId, TCityId>({
  selectedCityCount,
  selectedCityIdSet,
  user,
  viewerId,
}: {
  selectedCityCount: number
  selectedCityIdSet: Set<string>
  user: NearbyBuilderVisibilityCandidate<TUserId, TCityId>
  /** Null for signed-out visitors, who have no row to exclude. */
  viewerId: TUserId | null
}) {
  if (viewerId !== null && String(user._id) === String(viewerId)) return false

  return (
    selectedCityCount <= 1 ||
    (user.profile.cityId !== null &&
      selectedCityIdSet.has(String(user.profile.cityId)))
  )
}

export function shouldReportPostSearchHasMore({
  candidateCount,
  candidateTake,
  limit,
  visibleCount,
}: {
  candidateCount: number
  candidateTake: number
  limit: number
  visibleCount: number
}) {
  return visibleCount > limit || candidateCount >= candidateTake
}

/**
 * The comparison key for a language name, shared by stack preferences and the
 * `language` filter: trimmed and case-insensitive, so
 * "TypeScript", "typescript" and " TYPESCRIPT " are one language.
 */
export function normalizeExploreLanguage(value: string) {
  return value.trim().toLowerCase()
}

/**
 * Explore project filters, normalised; null means "any".
 * `language` matches `github.primaryLanguage` only; `topic` matches the
 * canonical topics (`getProjectTopics`: edited Locatic tags when present,
 * otherwise GitHub topics), so a card's topics are exactly what the filter
 * tests.
 */
export type ExploreProjectFilters = {
  language: string | null
  topic: string | null
}

export function normalizeExploreProjectFilters({
  language,
  topic,
}: {
  language?: string | null
  topic?: string | null
}): ExploreProjectFilters {
  const normalizedLanguage = language ? normalizeExploreLanguage(language) : ''
  const normalizedTopic = topic ? normalizeProjectTopic(topic) : ''

  return {
    language: normalizedLanguage || null,
    topic: normalizedTopic || null,
  }
}

/** Language and topic are ANDed with each other and with the feed scope. */
export function matchesExploreProjectFilters<
  TProject extends ExploreProjectStackCandidate,
>(
  project: TProject,
  filters: ExploreProjectFilters,
  getTopics: (project: TProject) => string[],
) {
  if (
    filters.language !== null &&
    (project.github.primaryLanguage === null ||
      normalizeExploreLanguage(project.github.primaryLanguage) !==
        filters.language)
  ) {
    return false
  }

  return filters.topic === null || getTopics(project).includes(filters.topic)
}

/**
 * Accounts younger than this read as new builders. Mirrors
 * `NEW_BUILDER_WINDOW_MS` in `src/lib/builder-activity.ts`; a test pins the
 * two together.
 */
export const NEW_BUILDER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Whether a builder row carries the "new builder" label: a boolean instead
 * of the account's creation time, so public payloads do not expose it.
 */
export function isNewBuilderAccount(createdAt: number, now: number) {
  return now - createdAt < NEW_BUILDER_WINDOW_MS
}

/**
 * Build statuses the builders "open to collab" filter keeps:
 * the statuses that invite someone in. Mirrors `isCollaborationStatus` in
 * `src/components/ui/status-pill.tsx`, which decides where the pill shows.
 */
export const COLLABORATION_BUILD_STATUSES: ReadonlySet<string> = new Set([
  'open_to_collab',
  'looking_for_cofounder',
  'hiring',
])

export function isOpenToCollaboration(buildStatus: string) {
  return COLLABORATION_BUILD_STATUSES.has(buildStatus)
}

export function matchesExploreProjectStack(
  project: ExploreProjectStackCandidate,
  stackPrefs: Set<string>,
  topics: string[] = [],
) {
  if (stackPrefs.size === 0) return false

  const normalizedStackPrefs = new Set(
    [...stackPrefs].map(normalizeExploreLanguage),
  )
  const languages = [
    project.github.primaryLanguage,
    ...(project.github.languages ?? []).map((language) => language.name),
  ].filter((language): language is string => Boolean(language))

  return [...languages, ...topics].some((value) =>
    normalizedStackPrefs.has(normalizeExploreLanguage(value)),
  )
}

export function rankExploreProjectsByStack<
  TProject extends ExploreProjectStackCandidate,
>({
  getTopics,
  projects,
  stackPrefs,
}: {
  getTopics: (project: TProject) => string[]
  projects: TProject[]
  stackPrefs: Set<string>
}) {
  return [...projects].sort(
    (left, right) =>
      Number(matchesExploreProjectStack(right, stackPrefs, getTopics(right))) -
        Number(matchesExploreProjectStack(left, stackPrefs, getTopics(left))) ||
      right.github.lastCommitAt - left.github.lastCommitAt,
  )
}
