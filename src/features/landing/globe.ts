import { LAND_BITS, LAND_GRID_STEP } from '@/lib/land-dots'
import type { LatLng } from '@/lib/geo'

// Orthographic globe maths for the landing hero (`PingGlobe`). Pure: the
// server and the client use the same functions, so the first paint places the
// ping card exactly where the canvas later draws its city.

const RAD = Math.PI / 180

/**
 * Where the globe faces, in degrees: the longitude and latitude at the centre
 * of the disc. Moving `lambda` down turns the globe eastward (places move
 * right), like the Earth seen from space.
 */
export type GlobeRotation = { lambda: number; phi: number }

/**
 * A point on the unit disc: `x` to the right, `y` down, both in [-1, 1], and
 * `z` towards the viewer (cos of the angle from the centre). The point is on
 * the visible hemisphere when `z > 0`.
 */
export type GlobePoint = { x: number; y: number; z: number }

/** The globe's radius as a fraction of its square box's width. */
export const GLOBE_RADIUS = 0.46

/**
 * How far a faced place sits from the centre, in degrees: west of the centre
 * (left), and a little south of it, so the globe tilts its north, where most
 * land is, towards the viewer.
 */
const FACE_OFFSET_LNG = 15
const FACE_OFFSET_LAT = -8
/** Tilt range: past this the globe shows mostly ice. */
const MIN_PHI = -35
const MAX_PHI = 40

/** A longitude in [-180, 180). */
export function wrapLongitude(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180
}

/** Orthographic projection of `point` for a globe facing `rotation`. */
export function projectToGlobe(
  point: LatLng,
  rotation: GlobeRotation,
): GlobePoint {
  const phi = point.lat * RAD
  const dLambda = (point.lng - rotation.lambda) * RAD
  const phi0 = rotation.phi * RAD
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const cosDLambda = Math.cos(dLambda)
  return {
    x: cosPhi * Math.sin(dLambda),
    y: -(Math.cos(phi0) * sinPhi - Math.sin(phi0) * cosPhi * cosDLambda),
    z: Math.sin(phi0) * sinPhi + Math.cos(phi0) * cosPhi * cosDLambda,
  }
}

/**
 * The rotation that brings `point` to the front, a little left of and below
 * centre. The tilt is clamped so high latitudes do not tip the globe over.
 */
export function faceRotation(point: LatLng): GlobeRotation {
  return {
    lambda: wrapLongitude(point.lng + FACE_OFFSET_LNG),
    phi: Math.min(Math.max(point.lat - FACE_OFFSET_LAT, MIN_PHI), MAX_PHI),
  }
}

/** Tilt range a drag may reach: further than the tour, short of the poles. */
const DRAG_MIN_PHI = -60
const DRAG_MAX_PHI = 60

/** A tilt clamped to the range a drag may reach. */
export function clampDragPhi(phi: number): number {
  return Math.min(Math.max(phi, DRAG_MIN_PHI), DRAG_MAX_PHI)
}

/**
 * Degrees the globe turns per pixel of drag in a box `boxWidth` pixels wide:
 * a place at the centre of the disc stays under the pointer.
 */
export function dragDegreesPerPixel(boxWidth: number): number {
  return 1 / (RAD * GLOBE_RADIUS * Math.max(boxWidth, 1))
}

/**
 * The rotation after dragging `dx`, `dy` pixels from `start`: the globe
 * follows the pointer, so dragging right moves places right (lower
 * `lambda`) and dragging down moves them down (higher `phi`).
 */
export function dragRotation(
  start: GlobeRotation,
  dx: number,
  dy: number,
  boxWidth: number,
): GlobeRotation {
  const degreesPerPixel = dragDegreesPerPixel(boxWidth)
  return {
    lambda: wrapLongitude(start.lambda - dx * degreesPerPixel),
    phi: clampDragPhi(start.phi + dy * degreesPerPixel),
  }
}

/** A projected point as fractions of the globe's square box, from its top left. */
export function toBoxFraction(point: GlobePoint): {
  left: number
  top: number
} {
  return {
    left: 0.5 + point.x * GLOBE_RADIUS,
    top: 0.5 + point.y * GLOBE_RADIUS,
  }
}

/**
 * CSS custom properties that place an overlay anchor on `point`: `--gx` and
 * `--gy` as percentages of the box, `--gv` as opacity (it fades out towards
 * the rim and is 0 on the far side). The overlay reads them; the animation
 * loop rewrites them every frame.
 */
export function anchorVariables(
  point: LatLng,
  rotation: GlobeRotation,
): { '--gx': string; '--gy': string; '--gv': string } {
  const projected = projectToGlobe(point, rotation)
  const { left, top } = toBoxFraction(projected)
  return {
    '--gx': `${(left * 100).toFixed(2)}%`,
    '--gy': `${(top * 100).toFixed(2)}%`,
    '--gv': anchorOpacity(projected.z).toFixed(2),
  }
}

/**
 * Anchor opacity for depth `z`: full on the face, fading at the rim, 0 on the
 * far side (`z <= 0`) so a card never shows through the globe.
 */
function anchorOpacity(z: number): number {
  return Math.min(Math.max((z - 0.05) / 0.2, 0), 1)
}

/** A critically damped spring on one axis: position and velocity. */
export type SpringAxis = { value: number; velocity: number }

/**
 * Advances `axis` towards `target` by `dt` seconds with a critically damped
 * spring of angular frequency `omega` (no overshoot; settles in about
 * 5 / omega seconds). Mutates `axis` so the animation loop allocates nothing.
 * `delta` is the signed distance to the target, already wrapped for
 * longitudes.
 */
export function stepSpring(
  axis: SpringAxis,
  delta: number,
  dt: number,
  omega: number,
): void {
  // Semi-implicit Euler; stable while omega * dt stays well below 1, which
  // the caller guarantees by clamping dt.
  axis.velocity += (omega * omega * delta - 2 * omega * axis.velocity) * dt
  axis.value += axis.velocity * dt
}

/** Land dots on the sphere, as parallel arrays in degrees. */
export type LandDots = { lat: Float32Array; lng: Float32Array }

/**
 * Decodes the generated land bitset (`src/lib/land-dots.ts`) back into
 * points. The grid walk must match scripts/generate-land-dots.mjs: rows
 * `step` degrees apart from the north pole, round(360 cos(lat) / step)
 * points per row, each at the middle of its slot.
 */
export function decodeLandDots(
  bits: string = LAND_BITS,
  step: number = LAND_GRID_STEP,
): LandDots {
  const binary = atob(bits)
  const lats: number[] = []
  const lngs: number[] = []
  const rows = Math.round(180 / step)
  let bit = 0
  for (let row = 0; row < rows; row++) {
    const lat = 90 - (row + 0.5) * step
    const count = Math.max(1, Math.round((360 * Math.cos(lat * RAD)) / step))
    for (let index = 0; index < count; index++, bit++) {
      if (binary.charCodeAt(bit >> 3) & (1 << (bit & 7))) {
        lats.push(lat)
        lngs.push(-180 + ((index + 0.5) * 360) / count)
      }
    }
  }
  return { lat: Float32Array.from(lats), lng: Float32Array.from(lngs) }
}
