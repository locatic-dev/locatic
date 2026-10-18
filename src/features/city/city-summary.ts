import { formatDate } from '@/lib/time'
import type { CityPagePayload } from './types'

const SUMMARY_LANGUAGE_LIMIT = 3

/**
 * The languages recent work in a city is most often written in: each
 * project's primary language counted once, most common first, ties by name.
 */
export function topCityLanguages(
  projects: Array<{ primaryLanguage: string | null }>,
  limit = SUMMARY_LANGUAGE_LIMIT,
): string[] {
  const counts = new Map<string, number>()
  for (const { primaryLanguage } of projects) {
    if (primaryLanguage) {
      counts.set(primaryLanguage, (counts.get(primaryLanguage) ?? 0) + 1)
    }
  }
  return [...counts]
    .sort(([a, aCount], [b, bCount]) => bCount - aCount || a.localeCompare(b))
    .slice(0, limit)
    .map(([language]) => language)
}

function listWords(words: string[]): string {
  return words.length <= 1
    ? (words[0] ?? '')
    : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

/**
 * A plain-sentence summary of a city page, for the page header and its meta
 * description: counts, the common languages of recent work and the last
 * activity date. It describes and never ranks: no builder is named.
 */
export function describeCity({
  name,
  stats,
  languages,
}: {
  name: string
  stats: CityPagePayload['stats']
  languages: string[]
}): string {
  if (stats.builderCount === 0) {
    return `No builders in ${name} share public work on Locatic yet.`
  }
  const builders =
    stats.builderCount === 1
      ? `1 builder in ${name} shares`
      : `${stats.builderCount} builders in ${name} share`
  const projects =
    stats.projectCount === 1
      ? '1 public project'
      : `${stats.projectCount} public projects`
  return [
    `${builders} ${projects} on Locatic.`,
    languages.length > 0
      ? `Recent work is mostly ${listWords(languages)}.`
      : null,
    stats.lastActivityAt
      ? `Last activity: ${formatDate(stats.lastActivityAt)}.`
      : null,
  ]
    .filter(Boolean)
    .join(' ')
}

/** `describeCity` for a loaded city page. */
export function describeCityPage(page: CityPagePayload): string {
  return describeCity({
    name: page.city.name,
    stats: page.stats,
    languages: topCityLanguages(page.recentWork.projects),
  })
}
