import { describe, expect, it } from 'vitest'

import {
  getActivityCellKey,
  getGreatCircleDistanceKm,
  getNeighbouringCellKeys,
  projectEquirectangular,
} from '../geo'

const BENGALURU = { lat: 12.9716, lng: 77.5946 }
const MYSURU = { lat: 12.2958, lng: 76.6394 }
const HYDERABAD = { lat: 17.385, lng: 78.4867 }
const LONDON = { lat: 51.5074, lng: -0.1278 }
const NEW_YORK = { lat: 40.7128, lng: -74.006 }

describe('getGreatCircleDistanceKm', () => {
  it('matches known city distances', () => {
    expect(getGreatCircleDistanceKm(BENGALURU, MYSURU)).toBeCloseTo(128, -1)
    expect(getGreatCircleDistanceKm(LONDON, NEW_YORK)).toBeCloseTo(5570, -2)
    expect(getGreatCircleDistanceKm(BENGALURU, BENGALURU)).toBe(0)
  })

  it('is symmetric and crosses the antimeridian the short way', () => {
    const west = { lat: 0, lng: 179.5 }
    const east = { lat: 0, lng: -179.5 }
    expect(getGreatCircleDistanceKm(west, east)).toBeCloseTo(111, 0)
    expect(getGreatCircleDistanceKm(east, west)).toBe(
      getGreatCircleDistanceKm(west, east),
    )
  })
})

describe('activity cells', () => {
  it('puts nearby cities in neighbouring cells and far ones outside', () => {
    const neighbours = getNeighbouringCellKeys(MYSURU)

    expect(neighbours).toHaveLength(9)
    expect(neighbours).toContain(getActivityCellKey(MYSURU))
    expect(neighbours).toContain(getActivityCellKey(BENGALURU))
    expect(neighbours).not.toContain(getActivityCellKey(HYDERABAD))
    expect(neighbours).not.toContain(getActivityCellKey(LONDON))
  })

  it('wraps longitude at the antimeridian', () => {
    expect(getNeighbouringCellKeys({ lat: 0, lng: 179.5 })).toContain(
      getActivityCellKey({ lat: 0, lng: -179.5 }),
    )
  })

  it('drops rows past the poles', () => {
    expect(getNeighbouringCellKeys({ lat: 89.9, lng: 0 })).toHaveLength(6)
    expect(getNeighbouringCellKeys({ lat: -90, lng: 0 })).toHaveLength(6)
  })
})

describe('projectEquirectangular', () => {
  const world = { west: -180, east: 180, north: 90, south: -90 }

  it('maps corners and the centre to fractions', () => {
    expect(projectEquirectangular({ lat: 90, lng: -180 }, world)).toEqual({
      x: 0,
      y: 0,
    })
    expect(projectEquirectangular({ lat: 0, lng: 0 }, world)).toEqual({
      x: 0.5,
      y: 0.5,
    })
    expect(projectEquirectangular({ lat: -90, lng: 180 }, world)).toEqual({
      x: 1,
      y: 1,
    })
  })

  it('clamps locations outside the bounds', () => {
    const bounds = { west: -170, east: 170, north: 75, south: -65 }
    expect(projectEquirectangular({ lat: 85, lng: 175 }, bounds)).toEqual({
      x: 1,
      y: 0,
    })
  })
})
