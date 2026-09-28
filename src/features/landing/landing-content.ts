import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { projectToMaskCell, type DotMapPoint } from '@/components/ui/dot-map'

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

/** Most pins the hero draws; each pin is a node with its own entrance. */
export const LANDING_MAP_MAX_PINS = 40

export type LandingMap =
  | { kind: 'example' }
  | {
      kind: 'cities'
      /** Cities with builders, all of them, not only the plotted ones. */
      cityCount: number
      /** One pin per land-mask dot, most builders first. */
      points: DotMapPoint[]
      /** The cities the caption names, most builders first. */
      featured: ActiveMapCity[]
    }

/**
 * What the hero map shows: real cities with builders once there are at
 * least `LANDING_MAP_MIN_CITIES`, else the example. `cities` come most
 * builders first (the query's order); cities that land on the same mask dot
 * share one pin, the busiest one's.
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
    const { row, col } = projectToMaskCell(city)
    const cell = `${row}:${col}`
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
  }
}
