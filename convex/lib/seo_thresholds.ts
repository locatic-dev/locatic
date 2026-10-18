// Thin-page rules for search indexes. Below these sizes a public page still
// works for people and its links are still followed, but it carries
// `noindex` and stays out of the sitemap, so thin pages don't weigh on the
// whole site. Shared by `convex/sitemap.ts` and the route heads in `src/`.

/** Counted builders (exact-city, discoverable) a city page needs. */
export const INDEXABLE_CITY_MIN_BUILDERS = 3

/** Visible projects a profile needs. */
export const INDEXABLE_PROFILE_MIN_PROJECTS = 1

export function isCityIndexable(stats: { builderCount: number }): boolean {
  return stats.builderCount >= INDEXABLE_CITY_MIN_BUILDERS
}

export function isProfileIndexable(stats: { projectsCount: number }): boolean {
  return stats.projectsCount >= INDEXABLE_PROFILE_MIN_PROJECTS
}
