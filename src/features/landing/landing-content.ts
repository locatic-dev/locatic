import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import type { DotMapPoint } from '@/components/ui/dot-map'
import type { LatLng } from '@/lib/geo'

/** One city on the landing map, as `api.cities.listActiveForMap` returns it. */
export type ActiveMapCity = FunctionReturnType<
  typeof api.cities.listActiveForMap
>[number]

/**
 * Fewer cities with activity than this and the landing shows no city dots
 *: a handful of dots reads as an empty
 * product, not a map.
 */
export const LANDING_MAP_MIN_CITIES = 5

/** Cities the caption names; the rest are counted. */
const FEATURED_CITY_COUNT = 3

/** Most city dots the hero globe draws. */
export const LANDING_MAP_MAX_PINS = 40

/**
 * The ~1° cell a place falls in (about 110 km). Places in one cell would draw
 * on top of each other on the globe, so the map keeps one per cell.
 */
export function getLatLngCell(location: LatLng): string {
  // -180 and 180 are one meridian, so both sides of it share a cell.
  const lng = Math.round(location.lng)
  return `${Math.round(location.lat)}:${lng === -180 ? 180 : lng}`
}

/**
 * The map's cities that have something in `activity`, in their order. A
 * city's builder count includes builders with nothing public yet (no
 * projects), so without this the globe and its caption would mark places
 * where nothing ever pings.
 */
export function getCitiesWithActivity(
  cities: ReadonlyArray<ActiveMapCity> | undefined,
  activity: ReadonlyArray<LandingActivity> | undefined,
): ActiveMapCity[] {
  const active = new Set((activity ?? []).map((item) => item.city.slug))
  return (cities ?? []).filter((city) => active.has(city.slug))
}

export type LandingMap =
  | { kind: 'example' }
  | {
      kind: 'cities'
      /** Cities with builders, all of them, not only the plotted ones. */
      cityCount: number
      /** One pin per ~1° cell (`getLatLngCell`), most builders first. */
      points: DotMapPoint[]
      /** The cities the caption names, most builders first. */
      featured: ActiveMapCity[]
      /** Every city with builders, most builders first. */
      cities: ActiveMapCity[]
    }

/**
 * What the hero map shows: real cities with builders once there are at
 * least `LANDING_MAP_MIN_CITIES`, else none (no city dots). `cities` come most
 * builders first (the query's order); cities in the same ~1° cell share one
 * pin, the busiest one's.
 */
export function getLandingMap(
  cities: ReadonlyArray<ActiveMapCity> | undefined,
): LandingMap {
  const withBuilders = (cities ?? []).filter((city) => city.builderCount > 0)
  if (withBuilders.length < LANDING_MAP_MIN_CITIES) {
    return { kind: 'example' }
  }

  const plottedCells = new Set<string>()
  const points: DotMapPoint[] = []
  for (const city of withBuilders) {
    const cell = getLatLngCell(city)
    if (plottedCells.has(cell)) {
      continue
    }
    plottedCells.add(cell)
    points.push({ id: city.slug, lat: city.lat, lng: city.lng })
    if (points.length === LANDING_MAP_MAX_PINS) {
      break
    }
  }

  return {
    kind: 'cities',
    cityCount: withBuilders.length,
    points,
    featured: withBuilders.slice(0, FEATURED_CITY_COUNT),
    cities: withBuilders,
  }
}

/** One item of `api.landing.listRecentActivity`: a post, release or project. */
export type LandingActivity = FunctionReturnType<
  typeof api.landing.listRecentActivity
>[number]

/** What a ping is about; the card tags it. */
export type PingKind = LandingActivity['kind']

/** Where a ping's card leads: the project page, with a post or release deep link. */
export type PingLink = {
  owner: string
  repo: string
  search: { post?: string; release?: string }
}

/** One beat of the landing `PingGlobe`: a city, and the card beside it. */
export type PingItem = {
  key: string
  kind: PingKind
  /** The city's coordinates. */
  lat: number
  lng: number
  /** "Saroj posted in portfolio". */
  headline: string
  /** A second line: the post excerpt, release name or repo description. */
  detail: string | null
  /** City name; rendered as an uppercase eyebrow. */
  place: string
  /** When it happened. */
  at: number
  avatarUrl: string | null
  link: PingLink
}

/** A new city pings this often. */
export const PING_INTERVAL_MS = 4500
/** How long each ping's card stays up; shorter than the interval. */
export const PING_CARD_MS = 3500

function firstWord(text: string): string {
  return text.trim().split(/\s+/)[0] ?? ''
}

function describeActivity(activity: LandingActivity): {
  headline: string
  detail: string | null
  search: PingLink['search']
} {
  const name = firstWord(activity.actor.name) || activity.actor.handle
  const { repo } = activity.project
  switch (activity.kind) {
    case 'post':
      return {
        headline: `${name} posted in ${repo}`,
        detail: activity.excerpt || null,
        search: { post: String(activity.postId) },
      }
    case 'release':
      return {
        headline: `${name} released ${repo} ${activity.tag}`,
        detail:
          activity.name && activity.name !== activity.tag
            ? activity.name
            : null,
        search: { release: String(activity.releaseId) },
      }
    case 'push':
      return {
        headline: `${name} shipped ${repo}`,
        detail: activity.project.description,
        search: {},
      }
    case 'project':
    default:
      return {
        headline: `${name} shared ${repo}`,
        detail: activity.project.description,
        search: {},
      }
  }
}

/**
 * What the landing map pings, in order. Nothing is invented: the recent
 * activity (newest first, already limited to exact-city owners by the
 * server), each on its city and leading to its post, release or project.
 * While there is none, nothing pings and the globe shows only its cities.
 */
export function getPingSequence(
  activity: ReadonlyArray<LandingActivity> | undefined,
): PingItem[] {
  return (activity ?? []).map((item) => {
    const { headline, detail, search } = describeActivity(item)
    return {
      key: item.key,
      kind: item.kind,
      lat: item.city.lat,
      lng: item.city.lng,
      headline,
      detail,
      place: item.city.name,
      at: item.at,
      avatarUrl: item.actor.avatarUrl,
      link: { owner: item.project.owner, repo: item.project.repo, search },
    }
  })
}

/** Every plotted city: the globe's quiet city dots. */
export function getLandingCityDots(
  map: LandingMap,
): Array<{ key: string; lat: number; lng: number }> {
  if (map.kind === 'example') {
    return []
  }
  return map.points.map((point) => ({
    key: point.id,
    lat: point.lat,
    lng: point.lng,
  }))
}
