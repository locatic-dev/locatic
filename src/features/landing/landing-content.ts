import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import type { DotMapPoint } from '@/components/ui/dot-map'
import type { ProjectCardPreview } from '@/features/contracts'
import type { LatLng } from '@/lib/geo'

/** One city on the landing map, as `api.cities.listActiveForMap` returns it. */
export type ActiveMapCity = FunctionReturnType<
  typeof api.cities.listActiveForMap
>[number]

/**
 * Fewer cities with builders than this and the landing shows the labelled
 * example map instead (plan item D7): a handful of dots reads as an empty
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
      /**
       * Every city with builders, most builders first: the ping top-up walks
       * these, since the featured few can share one cell.
       */
      cities: ActiveMapCity[]
    }

/**
 * What the hero map shows: real cities with builders once there are at
 * least `LANDING_MAP_MIN_CITIES`, else the example. `cities` come most
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

/** One beat of the landing `PingGlobe`: a city, and the card beside it. */
export type PingItem = {
  key: string
  /** The city's coordinates. */
  lat: number
  lng: number
  /** "Saroj pushed portfolio", "12 builders", or example copy. */
  headline: string
  /** City name; rendered as an uppercase eyebrow. */
  place: string
  /** Latest update time, or null when there is none to show. */
  at: number | null
  avatarUrl: string | null
  /** Illustrative item from the example map: the card says `EXAMPLE`. */
  example: boolean
}

/** A new city pings this often. */
export const PING_INTERVAL_MS = 2500
/** How long each ping's card stays up; shorter than the interval. */
export const PING_CARD_MS = 2000

/** Fewest items the map cycles through while real cities are available. */
const MIN_PING_ITEMS = 3

/**
 * Example pings (plan item D7): real places, neutral copy, no names, and the
 * `EXAMPLE` label on every card. Shown only with the example map. The order
 * tours westward, the way the globe drifts, so each turn is short.
 */
const EXAMPLE_PING_SOURCES: ReadonlyArray<{
  key: string
  place: string
  location: LatLng
  headline: string
}> = [
  {
    key: 'example-blr',
    place: 'Bengaluru',
    location: { lat: 12.97, lng: 77.59 },
    headline: 'a builder pushed a repo',
  },
  {
    key: 'example-ber',
    place: 'Berlin',
    location: { lat: 52.52, lng: 13.4 },
    headline: 'a builder released v0.3',
  },
  {
    key: 'example-ldn',
    place: 'London',
    location: { lat: 51.51, lng: -0.13 },
    headline: 'a builder posted an update',
  },
  {
    key: 'example-sao',
    place: 'São Paulo',
    location: { lat: -23.55, lng: -46.63 },
    headline: 'a builder pushed a repo',
  },
  {
    key: 'example-nyc',
    place: 'New York',
    location: { lat: 40.71, lng: -74.01 },
    headline: 'a builder released v1.0',
  },
  {
    key: 'example-sf',
    place: 'San Francisco',
    location: { lat: 37.77, lng: -122.42 },
    headline: 'a builder posted an update',
  },
  {
    key: 'example-tyo',
    place: 'Tokyo',
    location: { lat: 35.68, lng: 139.69 },
    headline: 'a builder pushed a repo',
  },
]

export const EXAMPLE_PINGS: ReadonlyArray<PingItem> = EXAMPLE_PING_SOURCES.map(
  ({ key, place, location, headline }) => ({
    key,
    lat: location.lat,
    lng: location.lng,
    headline,
    place,
    at: null,
    avatarUrl: null,
    example: true,
  }),
)

type PingCity = { _id: string; name: string; location: LatLng }

/** Exact cities of the showcase owners, for `cities.listByIds`. */
export function getShowcaseCityIds(
  showcase: ReadonlyArray<ProjectCardPreview> | undefined,
): string[] {
  const ids = new Set<string>()
  for (const project of showcase ?? []) {
    if (project.ownerLocation?.kind === 'city') {
      ids.add(project.ownerLocation.cityId)
    }
  }
  return [...ids]
}

function firstWord(text: string): string {
  return text.trim().split(/\s+/)[0] ?? ''
}

function describeUpdate(project: ProjectCardPreview): string {
  const update = project.latestUpdate
  if (update?.kind === 'release') {
    return update.label
      ? `released ${project.repo} ${update.label}`
      : `released ${project.repo}`
  }
  if (update?.kind === 'post') {
    return `posted in ${project.repo}`
  }
  if (update?.kind === 'repo') {
    return `pushed ${project.repo}`
  }
  // No update to describe: say only that the project is on Locatic.
  return `shared ${project.repo}`
}

/**
 * What the landing map pings, in order. Nothing is invented:
 *
 * 1. The example map gives `EXAMPLE_PINGS`.
 * 2. Otherwise each showcase project whose owner discloses an exact city we
 *    have coordinates for, in showcase order ("Saroj pushed portfolio").
 *    Region-only and hidden owners never appear.
 * 3. Then the busiest cities ("12 builders"), from every city with builders,
 *    in ~1° cells not already pinged (`getLatLngCell`), until there are
 *    `MIN_PING_ITEMS` items in as many cells, so the cycle and the
 *    reduced-motion frame show several places even when the showcase owners,
 *    or the busiest cities, share one cell.
 */
export function getPingSequence(input: {
  map: LandingMap
  showcase: ReadonlyArray<ProjectCardPreview>
  cities: ReadonlyArray<PingCity>
}): PingItem[] {
  const { map, showcase, cities } = input
  if (map.kind === 'example') {
    return [...EXAMPLE_PINGS]
  }

  const cityById = new Map(cities.map((city) => [city._id, city]))
  const items: PingItem[] = []
  const pingedCells = new Set<string>()

  for (const project of showcase) {
    const location = project.ownerLocation
    const city =
      location?.kind === 'city' ? cityById.get(location.cityId) : null
    if (!city) {
      continue
    }
    pingedCells.add(getLatLngCell(city.location))
    const name = firstWord(project.authorName) || project.authorHandle
    items.push({
      key: `project:${project.projectId}`,
      lat: city.location.lat,
      lng: city.location.lng,
      headline: `${name} ${describeUpdate(project)}`,
      place: city.name,
      at: project.latestUpdate?.at ?? null,
      avatarUrl: project.authorAvatarUrl,
      example: false,
    })
  }

  for (const city of map.cities) {
    if (items.length >= MIN_PING_ITEMS && pingedCells.size >= MIN_PING_ITEMS) {
      break
    }
    const cell = getLatLngCell(city)
    if (pingedCells.has(cell)) {
      continue
    }
    pingedCells.add(cell)
    items.push({
      key: `city:${city.slug}`,
      lat: city.lat,
      lng: city.lng,
      headline: `${city.builderCount} ${city.builderCount === 1 ? 'builder' : 'builders'}`,
      place: city.name,
      at: null,
      avatarUrl: null,
      example: false,
    })
  }

  return items
}

/** Every plotted city with builders: the globe's quiet city dots. */
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
