/**
 * Pure geography helpers, shared by Convex and the client:
 * `src/lib/geo.ts` re-exports them. No Convex imports, so the module is safe
 * in both bundles.
 */

export type LatLng = { lat: number; lng: number }

/**
 * Side of an activity cell in degrees. A city's cell plus its eight
 * neighbours reach at least one cell (about 220 km north-south) in every
 * direction and at most two, which is what "nearby" means for city pages.
 * Longitude cells narrow towards the poles; the distance rank corrects the
 * order, not the reach.
 */
export const ACTIVITY_CELL_DEGREES = 2

const LAT_CELL_COUNT = 180 / ACTIVITY_CELL_DEGREES
const LNG_CELL_COUNT = 360 / ACTIVITY_CELL_DEGREES

const EARTH_RADIUS_KM = 6371

function latCellIndex(lat: number) {
  const index = Math.floor((lat + 90) / ACTIVITY_CELL_DEGREES)
  return Math.min(Math.max(index, 0), LAT_CELL_COUNT - 1)
}

function lngCellIndex(lng: number) {
  const index = Math.floor((lng + 180) / ACTIVITY_CELL_DEGREES)
  return ((index % LNG_CELL_COUNT) + LNG_CELL_COUNT) % LNG_CELL_COUNT
}

function cellKey(latIndex: number, lngIndex: number) {
  return `${latIndex}:${lngIndex}`
}

/** The coarse cell a location falls in, as a stable string key. */
export function getActivityCellKey(location: LatLng): string {
  return cellKey(latCellIndex(location.lat), lngCellIndex(location.lng))
}

/**
 * The location's cell and its neighbours (at most nine keys). Longitude
 * wraps at the antimeridian; rows past a pole are dropped.
 */
export function getNeighbouringCellKeys(location: LatLng): string[] {
  const latIndex = latCellIndex(location.lat)
  const lngIndex = lngCellIndex(location.lng)
  const keys = new Set<string>()
  for (let latOffset = -1; latOffset <= 1; latOffset += 1) {
    const row = latIndex + latOffset
    if (row < 0 || row >= LAT_CELL_COUNT) {
      continue
    }
    for (let lngOffset = -1; lngOffset <= 1; lngOffset += 1) {
      const column =
        (((lngIndex + lngOffset) % LNG_CELL_COUNT) + LNG_CELL_COUNT) %
        LNG_CELL_COUNT
      keys.add(cellKey(row, column))
    }
  }
  return [...keys]
}

/** Great-circle (haversine) distance in kilometres. */
export function getGreatCircleDistanceKm(from: LatLng, to: LatLng): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = toRadians(to.lat - from.lat)
  const dLng = toRadians(to.lng - from.lng)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) *
      Math.cos(toRadians(to.lat)) *
      Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

export type MapBounds = {
  west: number
  east: number
  north: number
  south: number
}

/**
 * Equirectangular projection into a bounding box: `x` runs west to east and
 * `y` north to south, both as fractions clamped to [0, 1].
 */
export function projectEquirectangular(
  location: LatLng,
  bounds: MapBounds,
): { x: number; y: number } {
  const clamp = (value: number) => Math.min(Math.max(value, 0), 1)
  return {
    x: clamp((location.lng - bounds.west) / (bounds.east - bounds.west)),
    y: clamp((bounds.north - location.lat) / (bounds.north - bounds.south)),
  }
}
