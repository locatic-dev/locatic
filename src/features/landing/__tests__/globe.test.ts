import { describe, expect, it } from 'vitest'

import { LAND_BITS, LAND_DOT_COUNT, LAND_GRID_STEP } from '@/lib/land-dots'
import type { LatLng } from '@/lib/geo'
import {
  GLOBE_RADIUS,
  anchorVariables,
  decodeLandDots,
  faceRotation,
  projectToGlobe,
  stepSpring,
  toBoxFraction,
  wrapLongitude,
  type SpringAxis,
} from '../globe'

const BENGALURU = { lat: 12.97, lng: 77.59 }
const LONDON = { lat: 51.51, lng: -0.13 }
const SAN_FRANCISCO = { lat: 37.77, lng: -122.42 }
const MID_PACIFIC = { lat: 0, lng: -150 }

const RAD = Math.PI / 180

/** Great-circle distance in degrees. */
function angularDistance(a: LatLng, b: LatLng): number {
  const cos =
    Math.sin(a.lat * RAD) * Math.sin(b.lat * RAD) +
    Math.cos(a.lat * RAD) *
      Math.cos(b.lat * RAD) *
      Math.cos((a.lng - b.lng) * RAD)
  return Math.acos(Math.min(Math.max(cos, -1), 1)) / RAD
}

const land = decodeLandDots()

function nearestLandDot(point: LatLng): number {
  let nearest = Infinity
  for (let index = 0; index < land.lat.length; index++) {
    nearest = Math.min(
      nearest,
      angularDistance(point, { lat: land.lat[index], lng: land.lng[index] }),
    )
  }
  return nearest
}

describe('decodeLandDots', () => {
  it('decodes every land dot the generator counted, within budget', () => {
    expect(land.lat).toHaveLength(LAND_DOT_COUNT)
    expect(land.lng).toHaveLength(LAND_DOT_COUNT)
    // Small enough to ship in the landing chunk: ~4k dots, ~2 KB of base64.
    expect(LAND_DOT_COUNT).toBeLessThan(4500)
    expect(LAND_BITS.length).toBeLessThan(3000)
  })

  it('puts dots on land and none in the open ocean', () => {
    const spacing = LAND_GRID_STEP
    expect(nearestLandDot(BENGALURU)).toBeLessThan(spacing)
    expect(nearestLandDot(LONDON)).toBeLessThan(spacing)
    expect(nearestLandDot(SAN_FRANCISCO)).toBeLessThan(spacing)
    expect(nearestLandDot(MID_PACIFIC)).toBeGreaterThan(5)
    expect(nearestLandDot({ lat: -40, lng: -30 })).toBeGreaterThan(5)
  })

  it('keeps every dot on the sphere', () => {
    for (let index = 0; index < land.lat.length; index++) {
      expect(Math.abs(land.lat[index])).toBeLessThan(90)
      expect(land.lng[index]).toBeGreaterThanOrEqual(-180)
      expect(land.lng[index]).toBeLessThan(180)
    }
  })

  it('reads the bits of a hand-made grid in row order', () => {
    // A 90° grid: two rows (lat 45 and -45) of three points each (round(360
    // cos 45° / 90) = 3). Bits 0 and 4 set: 0b00010001.
    const decoded = decodeLandDots(btoa(String.fromCharCode(0b0001_0001)), 90)
    expect([...decoded.lat]).toEqual([45, -45])
    expect([...decoded.lng]).toEqual([-120, 0])
  })
})

describe('projectToGlobe', () => {
  it('puts the faced point at the centre, nearest the viewer', () => {
    const point = projectToGlobe(BENGALURU, {
      lambda: BENGALURU.lng,
      phi: BENGALURU.lat,
    })
    expect(point.x).toBeCloseTo(0, 10)
    expect(point.y).toBeCloseTo(0, 10)
    expect(point.z).toBeCloseTo(1, 10)
  })

  it('draws east to the right and north up', () => {
    const rotation = { lambda: 0, phi: 0 }
    expect(projectToGlobe({ lat: 0, lng: 90 }, rotation)).toMatchObject({
      x: expect.closeTo(1, 10),
      z: expect.closeTo(0, 10),
    })
    expect(projectToGlobe({ lat: 90, lng: 0 }, rotation).y).toBeCloseTo(-1, 10)
    expect(projectToGlobe({ lat: 30, lng: 20 }, rotation).y).toBeLessThan(0)
  })

  it('reports the far side with z <= 0 and the near side with z > 0', () => {
    const rotation = { lambda: 0, phi: 0 }
    expect(projectToGlobe({ lat: 0, lng: 180 }, rotation).z).toBeCloseTo(-1)
    expect(projectToGlobe({ lat: 0, lng: 91 }, rotation).z).toBeLessThan(0)
    expect(projectToGlobe({ lat: 0, lng: 89 }, rotation).z).toBeGreaterThan(0)
    // Tilting north brings the north pole into view.
    expect(projectToGlobe({ lat: 89, lng: 180 }, rotation).z).toBeLessThan(0.02)
    expect(
      projectToGlobe({ lat: 89, lng: 180 }, { lambda: 0, phi: 30 }).z,
    ).toBeGreaterThan(0)
  })

  it('stays on the unit disc', () => {
    for (const point of [BENGALURU, LONDON, SAN_FRANCISCO, MID_PACIFIC]) {
      const { x, y, z } = projectToGlobe(point, { lambda: 40, phi: 25 })
      expect(x * x + y * y + z * z).toBeCloseTo(1, 10)
    }
  })
})

describe('faceRotation', () => {
  it('brings a place to the front, a little left of and below centre', () => {
    for (const place of [
      BENGALURU,
      LONDON,
      SAN_FRANCISCO,
      { lat: -23.55, lng: -46.63 },
    ]) {
      const point = projectToGlobe(place, faceRotation(place))
      const { left, top } = toBoxFraction(point)
      expect(point.z).toBeGreaterThan(0.9)
      expect(left).toBeLessThan(0.5)
      expect(left).toBeGreaterThan(0.3)
      expect(Math.abs(top - 0.5)).toBeLessThan(0.15)
    }
  })

  it('clamps the tilt near the poles and wraps the longitude', () => {
    expect(faceRotation({ lat: 80, lng: 175 })).toEqual({
      lambda: -170,
      phi: 40,
    })
    expect(faceRotation({ lat: -80, lng: 0 }).phi).toBe(-35)
  })
})

describe('toBoxFraction and anchorVariables', () => {
  it('maps the disc into the box with the globe radius', () => {
    expect(toBoxFraction({ x: 0, y: 0, z: 1 })).toEqual({ left: 0.5, top: 0.5 })
    expect(toBoxFraction({ x: 1, y: -1, z: 0 })).toEqual({
      left: 0.5 + GLOBE_RADIUS,
      top: 0.5 - GLOBE_RADIUS,
    })
  })

  it('gives stable percentages, and hides anchors on the far side', () => {
    const rotation = { lambda: 0, phi: 0 }
    expect(anchorVariables({ lat: 0, lng: 0 }, rotation)).toEqual({
      '--gx': '50.00%',
      '--gy': '50.00%',
      '--gv': '1.00',
    })
    expect(anchorVariables({ lat: 0, lng: 180 }, rotation)['--gv']).toBe('0.00')
    // Near the rim the anchor fades rather than vanishing at once.
    const rim = Number(anchorVariables({ lat: 0, lng: 84 }, rotation)['--gv'])
    expect(rim).toBeGreaterThan(0)
    expect(rim).toBeLessThan(1)
  })
})

describe('wrapLongitude', () => {
  it('keeps longitudes in [-180, 180)', () => {
    expect(wrapLongitude(0)).toBe(0)
    expect(wrapLongitude(190)).toBe(-170)
    expect(wrapLongitude(-190)).toBe(170)
    expect(wrapLongitude(180)).toBe(-180)
    expect(wrapLongitude(540)).toBe(-180)
  })
})

describe('stepSpring', () => {
  it('settles on the target without overshooting', () => {
    const axis: SpringAxis = { value: 0, velocity: 0 }
    let peak = 0
    for (let frame = 0; frame < 120; frame++) {
      stepSpring(axis, 100 - axis.value, 1 / 60, 5)
      peak = Math.max(peak, axis.value)
    }
    expect(axis.value).toBeCloseTo(100, 0)
    expect(peak).toBeLessThanOrEqual(100.5)
  })

  it('does not move when dt is 0', () => {
    const axis: SpringAxis = { value: 3, velocity: 2 }
    stepSpring(axis, 50, 0, 5)
    expect(axis).toEqual({ value: 3, velocity: 2 })
  })
})
