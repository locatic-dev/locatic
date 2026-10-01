import {
  getFreshExploreSearch,
  type ExploreSearch,
} from '@/features/explore/state'
import type { CityPagePayload } from './types'

function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

/** "3 builders, 1 project": the maintained A4 counts, zeros included. */
export function formatCityCounts(stats: {
  builderCount: number
  projectCount: number
}) {
  return `${pluralize(stats.builderCount, 'builder', 'builders')}, ${pluralize(
    stats.projectCount,
    'project',
    'projects',
  )}`
}

/** No recent work, no listed builders and no posts: the empty-city state. */
export function isCityPageEmpty(page: CityPagePayload) {
  return (
    page.recentWork.projects.length === 0 &&
    page.builders.length === 0 &&
    page.posts.length === 0
  )
}

/** Explore narrowed to one city, for "more in Explore" links. */
export function getCityExploreSearch(
  cityId: string,
  mode: ExploreSearch['mode'] = 'projects',
): ExploreSearch {
  return {
    ...getFreshExploreSearch(),
    mode,
    scope: 'custom',
    selectedCityIds: [cityId],
  }
}

/** Global Explore, the "browse everywhere" fallback. */
export function getEverywhereExploreSearch(): ExploreSearch {
  return { ...getFreshExploreSearch(), scope: 'global' }
}

/** Accessible summary of the nearby-cities map. */
export function describeNearbyMap(cityName: string, nearbyCount: number) {
  return `map of ${cityName} and ${pluralize(
    nearbyCount,
    'nearby city',
    'nearby cities',
  )}`
}
