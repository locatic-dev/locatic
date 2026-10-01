import type { Id } from '../_generated/dataModel'
import type { Doc } from './types'

/**
 * Location privacy policy (plan decision D8). Every public surface that shows
 * where a user is, or that lists users or their work by city, goes through
 * this module:
 *
 * - `exact_city`: the city is disclosed and the user is a member of it.
 * - `region_only`: only a region/country label is disclosed; no city id, no
 *   exact-city name, no city membership.
 * - `hidden`: nothing is disclosed and there is no city membership.
 *
 * Discovery participation (`appearInExplore`) is a separate setting: it
 * decides whether a user appears in discovery at all, while this policy
 * decides what location they disclose and whether they count for a city.
 */

type CityVisibility = Doc<'users'>['privacy']['cityVisibility']

export type LocationPolicyUser = {
  profile: { cityId: Id<'cities'> | null }
  privacy: { cityVisibility: CityVisibility }
}

export type DisclosureCity = Pick<
  Doc<'cities'>,
  '_id' | 'name' | 'displayName' | 'region' | 'country'
>

export type LocationDisclosure =
  | {
      kind: 'city'
      cityId: Id<'cities'>
      cityName: string
      regionLabel: string | null
    }
  | { kind: 'region'; regionLabel: string }
  | { kind: 'none' }

export type PublicIdentity = {
  userId: Id<'users'>
  displayName: string
  avatarUrl: string | null
  githubUsername: string
  buildStatus: Doc<'users'>['profile']['buildStatus']
  location: LocationDisclosure
}

/** Denormalised `{ cityId, cityName }` pair stored on owner/actor snapshots. */
export type SnapshotLocation = {
  cityId: Id<'cities'> | null
  cityName: string | null
}

const FOLDED_LETTERS: Record<string, string> = {
  ł: 'l',
  đ: 'd',
  ø: 'o',
  ı: 'i',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
}

/**
 * Folded form used to compare place names: lower case, diacritics and a few
 * letters without a decomposition (ł, đ, ø, ı, ß, æ, œ) reduced to ASCII,
 * punctuation collapsed to single spaces, padded with spaces so a word-level
 * `includes` check cannot match inside a longer word.
 */
function foldPlaceName(value: string): string {
  const folded = value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[łđøıßæœ]/g, (letter) => FOLDED_LETTERS[letter] ?? letter)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  return folded ? ` ${folded} ` : ''
}

/**
 * True when a region or country label names the city: its folded form
 * contains the city name as whole words ("State of Berlin", "Kyiv City",
 * "Buenos Aires F.D.", "Hong Kong SAR China" for Hong Kong).
 */
function namesCity(label: string, cityName: string): boolean {
  const foldedCity = foldPlaceName(cityName)
  return foldedCity !== '' && foldPlaceName(label).includes(foldedCity)
}

/**
 * Region/country label for a city, never the city itself. A region or
 * country that names the city (city-states and capital districts such as
 * "State of Berlin", "Kyiv City", "Singapore", "Hong Kong SAR China") is
 * dropped, so the label cannot identify the city; when nothing else is left
 * the label is null and region-only users disclose nothing.
 */
export function getRegionLabel(city: DisclosureCity): string | null {
  const parts = [city.region, city.country].flatMap((part) => {
    const trimmed = part?.trim()
    return trimmed && !namesCity(trimmed, city.name) ? [trimmed] : []
  })
  return parts.length > 0 ? parts.join(', ') : null
}

/** True only for `exact_city` users with a city (optionally a given one). */
export function isCityMember(
  user: LocationPolicyUser,
  cityId?: Id<'cities'> | string,
): boolean {
  if (
    user.privacy.cityVisibility !== 'exact_city' ||
    user.profile.cityId === null
  ) {
    return false
  }

  return cityId === undefined || String(user.profile.cityId) === String(cityId)
}

/** The city a user counts for in lists, counts, snapshots and map data. */
export function getMemberCityId(user: LocationPolicyUser): Id<'cities'> | null {
  return isCityMember(user) ? user.profile.cityId : null
}

/**
 * What a public response may say about a user's location. `city` must be the
 * user's profile city (or null/undefined when it was not loaded or no longer
 * exists); a mismatched city discloses nothing.
 */
export function resolveLocationDisclosure(
  user: LocationPolicyUser,
  city: DisclosureCity | null | undefined,
): LocationDisclosure {
  const cityId = user.profile.cityId
  if (!cityId || !city || String(city._id) !== String(cityId)) {
    return { kind: 'none' }
  }

  switch (user.privacy.cityVisibility) {
    case 'exact_city':
      return {
        kind: 'city',
        cityId,
        cityName: city.displayName,
        regionLabel: getRegionLabel(city),
      }
    case 'region_only': {
      const regionLabel = getRegionLabel(city)
      return regionLabel ? { kind: 'region', regionLabel } : { kind: 'none' }
    }
    case 'hidden':
    default:
      return { kind: 'none' }
  }
}

/**
 * Stored snapshot encoding of a disclosure: `cityId` is set only for city
 * members; `cityName` carries the exact city name for members, the region
 * label for region-only users and null otherwise.
 */
export function toSnapshotLocation(
  disclosure: LocationDisclosure,
): SnapshotLocation {
  switch (disclosure.kind) {
    case 'city':
      return { cityId: disclosure.cityId, cityName: disclosure.cityName }
    case 'region':
      return { cityId: null, cityName: disclosure.regionLabel }
    case 'none':
    default:
      return { cityId: null, cityName: null }
  }
}

/** Public projection of a user used by every public surface. */
export function toPublicIdentity(
  user: Doc<'users'>,
  cityById: ReadonlyMap<string, DisclosureCity>,
): PublicIdentity {
  const city = user.profile.cityId
    ? cityById.get(String(user.profile.cityId))
    : undefined

  return {
    userId: user._id,
    displayName: user.profile.displayName,
    avatarUrl: user.profile.avatarUrl || null,
    githubUsername: user.github.username,
    buildStatus: user.profile.buildStatus,
    location: resolveLocationDisclosure(user, city),
  }
}
