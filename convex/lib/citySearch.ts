import type { DatabaseReader } from '../_generated/server'
import type { Doc } from './types'

/**
 * City search ranking (plan item B10, decision D6): exact matches first; then
 * cities with builders on Locatic; then alphabetical. The catalogue has no
 * population field, so the only importance signal is Locatic's own activity
 * (`cities.stats`, plan item A4). Candidates come from two bounded reads:
 *
 * - a prefix range on `normalizedName` (the lowercased display name, e.g.
 *   "berlin, state of berlin, germany") over active cities, capped at
 *   `PREFIX_READ_BUDGET` rows in index (alphabetical) order, enough to reach
 *   Berlin at position 47 of the catalogue's "ber" range;
 * - one page of the existing `search_text` full-text index, capped at
 *   `limit * TEXT_CANDIDATE_MULTIPLIER` rows, which is the only way to reach
 *   alias and word matches.
 *
 * Every candidate is then placed in exactly one tier, compared after folding
 * both sides with `foldCityText`:
 *
 *   0. exact name: the name, or the full normalized display name, equals the
 *      query ("berlin", "berlin, state of berlin, germany");
 *   1. exact alias: an alias equals the query ("nyc", "bangalore");
 *   2. name prefix: the name or normalized display name starts with the
 *      query ("ber" -> Bern, Berlin);
 *   3. alias prefix: an alias starts with the query;
 *   4. any other full-text hit (word or fuzzy match, e.g. "ber" -> Bnei Brak
 *      through its alias "bene berak").
 *
 * Within tiers 2-4: more builders first (`stats.builderCount`, missing stats
 * read as zero), then more projects (`stats.projectCount`). Then, in every
 * tier: shorter folded name, folded name, folded display name, id, so the
 * order is stable and explainable. Rows are deduplicated by id and inactive
 * rows are dropped.
 */

export const DEFAULT_CITY_SEARCH_LIMIT = 8
export const MAX_CITY_SEARCH_LIMIT = 20
/** Fixed row budget for the `normalizedName` prefix range. */
export const PREFIX_READ_BUDGET = 96
/** Full-text rows read per requested result. */
export const TEXT_CANDIDATE_MULTIPLIER = 4

/** Highest BMP code point; closes a string prefix range on an index. */
const PREFIX_RANGE_END = String.fromCharCode(0xffff)

export const CITY_MATCH_TIERS = [
  'exact_name',
  'exact_alias',
  'name_prefix',
  'alias_prefix',
  'text',
] as const
export type CityMatchTier = (typeof CITY_MATCH_TIERS)[number]

export type CitySearchCandidate = Pick<
  Doc<'cities'>,
  | '_id'
  | 'name'
  | 'displayName'
  | 'normalizedName'
  | 'aliases'
  | 'isActive'
  | 'stats'
>

/** Tiers (by index) whose order inside the tier weighs Locatic activity. */
const FIRST_ACTIVITY_WEIGHTED_TIER = CITY_MATCH_TIERS.indexOf('name_prefix')

/**
 * The query as stored names are normalised: `normalizedName` is
 * `displayName.toLowerCase()` (see `cities.seedDefaultCities` and
 * `scripts/geonames-to-cities-seed.mjs`), so the index range uses the trimmed,
 * lowercased query with runs of whitespace collapsed to one space.
 */
export function normalizeCitySearchQuery(query: string) {
  return query.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Lowercased, trimmed, whitespace-collapsed and diacritics-folded text. */
export function foldCityText(value: string) {
  return normalizeCitySearchQuery(
    value.normalize('NFKD').replace(/\p{M}/gu, ''),
  )
}

export function clampCitySearchLimit(limit: number | undefined) {
  const requested = Math.floor(limit ?? DEFAULT_CITY_SEARCH_LIMIT)
  if (!Number.isFinite(requested)) return DEFAULT_CITY_SEARCH_LIMIT
  return Math.min(Math.max(requested, 1), MAX_CITY_SEARCH_LIMIT)
}

export function getCityMatchTier(
  foldedQuery: string,
  city: CitySearchCandidate,
): CityMatchTier {
  const name = foldCityText(city.name)
  const fullName = foldCityText(city.normalizedName)
  const aliases = city.aliases.map(foldCityText)

  if (name === foldedQuery || fullName === foldedQuery) return 'exact_name'
  if (aliases.includes(foldedQuery)) return 'exact_alias'
  if (name.startsWith(foldedQuery) || fullName.startsWith(foldedQuery)) {
    return 'name_prefix'
  }
  if (aliases.some((alias) => alias.startsWith(foldedQuery))) {
    return 'alias_prefix'
  }
  return 'text'
}

function compareText(left: string, right: string) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

/**
 * Orders candidates by tier; within the prefix and full-text tiers by builder
 * count then project count (descending); then by folded name length, folded
 * name, folded display name and id. Drops inactive rows and duplicate ids and
 * returns at most `limit` rows.
 */
export function rankCitySearchResults<City extends CitySearchCandidate>(
  query: string,
  candidates: Iterable<City>,
  limit: number,
): City[] {
  const foldedQuery = foldCityText(query)
  if (!foldedQuery || limit <= 0) return []

  const seen = new Set<string>()
  const ranked: Array<{
    city: City
    tier: number
    builderCount: number
    projectCount: number
    name: string
    fullName: string
  }> = []
  for (const city of candidates) {
    const id = String(city._id)
    if (!city.isActive || seen.has(id)) continue
    seen.add(id)
    const tier = CITY_MATCH_TIERS.indexOf(getCityMatchTier(foldedQuery, city))
    const weighActivity = tier >= FIRST_ACTIVITY_WEIGHTED_TIER
    ranked.push({
      city,
      tier,
      builderCount: weighActivity ? (city.stats?.builderCount ?? 0) : 0,
      projectCount: weighActivity ? (city.stats?.projectCount ?? 0) : 0,
      name: foldCityText(city.name),
      fullName: foldCityText(city.normalizedName),
    })
  }

  ranked.sort(
    (left, right) =>
      left.tier - right.tier ||
      right.builderCount - left.builderCount ||
      right.projectCount - left.projectCount ||
      left.name.length - right.name.length ||
      compareText(left.name, right.name) ||
      compareText(left.fullName, right.fullName) ||
      compareText(String(left.city._id), String(right.city._id)),
  )

  return ranked.slice(0, limit).map((entry) => entry.city)
}

/**
 * Active cities whose `normalizedName` starts with `prefix`, in index order,
 * reading at most `PREFIX_READ_BUDGET` rows.
 */
export async function readCityPrefixCandidates(
  db: DatabaseReader,
  prefix: string,
) {
  if (!prefix) return []
  return await db
    .query('cities')
    .withIndex('by_active_normalized_name', (query) =>
      query
        .eq('isActive', true)
        .gte('normalizedName', prefix)
        .lt('normalizedName', prefix + PREFIX_RANGE_END),
    )
    .take(PREFIX_READ_BUDGET)
}

/** One page of full-text matches over active cities. */
export async function readCityTextCandidates(
  db: DatabaseReader,
  query: string,
  limit: number,
) {
  if (!query) return []
  return await db
    .query('cities')
    .withSearchIndex('search_text', (search) =>
      search.search('searchText', query).eq('isActive', true),
    )
    .take(limit * TEXT_CANDIDATE_MULTIPLIER)
}

/**
 * Ranked city search: exact, then prefix, then full-text matches. Reads at
 * most `PREFIX_READ_BUDGET + limit * TEXT_CANDIDATE_MULTIPLIER` documents
 * (176 at the maximum limit of 20).
 */
export async function searchCities(
  db: DatabaseReader,
  query: string,
  limit: number,
) {
  const normalizedQuery = normalizeCitySearchQuery(query)
  if (!normalizedQuery) return []

  const [prefixRows, textRows] = await Promise.all([
    readCityPrefixCandidates(db, normalizedQuery),
    readCityTextCandidates(db, normalizedQuery, limit),
  ])
  return rankCitySearchResults(
    normalizedQuery,
    [...prefixRows, ...textRows],
    limit,
  )
}
