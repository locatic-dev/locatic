// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { Id } from '../../../../convex/_generated/dataModel'
import type { ProjectCardPreview } from '@/features/contracts'
import { decodeLandDots } from '../globe'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    search: _search,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode
    params?: Record<string, string>
    search?: unknown
    to: string
  }) => (
    <a
      href={to.replace(
        /\$(\w+)/g,
        (_match, key: string) => params?.[key] ?? '',
      )}
      {...props}
    >
      {children}
    </a>
  ),
}))

import { HeroMapCaption } from '../hero-map-caption'
import {
  EXAMPLE_PINGS,
  LANDING_MAP_MAX_PINS,
  LANDING_MAP_MIN_CITIES,
  getLandingCityDots,
  getLandingMap,
  getLatLngCell,
  getPingSequence,
  getShowcaseCityIds,
  type ActiveMapCity,
} from '../landing-content'

function city(
  slug: string,
  lat: number,
  lng: number,
  builderCount = 1,
): ActiveMapCity {
  return { slug, name: slug, lat, lng, builderCount }
}

// Five cities on five different continents, most builders first.
const FIVE_CITIES = [
  city('bengaluru', 12.97, 77.59, 9),
  city('berlin', 52.52, 13.4, 6),
  city('new-york', 40.71, -74.0, 4),
  city('tokyo', 35.68, 139.69, 2),
  city('nairobi', -1.29, 36.82, 1),
]

function preview(
  repo: string,
  owner = 'alice',
  extra: Partial<ProjectCardPreview> = {},
): ProjectCardPreview {
  return {
    projectId: `project_${repo}` as Id<'projects'>,
    ownerUserId: `user_${owner}` as Id<'users'>,
    fullName: `${owner}/${repo}`,
    owner,
    repo,
    description: `${repo} does one thing well`,
    primaryLanguage: 'TypeScript',
    languages: [],
    githubStars: 0,
    locaticLikes: 0,
    commentsCount: 0,
    lastCommitAt: Date.now() - 2 * 60 * 60 * 1000,
    updatedAt: Date.now(),
    authorName: owner,
    authorHandle: owner,
    authorAvatarUrl: null,
    cityLabel: 'Bengaluru',
    cityVisibilityState: 'exact_city',
    ...extra,
  }
}

const BENGALURU_ID = 'city_bengaluru' as Id<'cities'>
const BERLIN_ID = 'city_berlin' as Id<'cities'>
const UNKNOWN_ID = 'city_unknown' as Id<'cities'>

const CITY_DOCS = [
  {
    _id: BENGALURU_ID,
    name: 'Bengaluru',
    location: { lat: 12.97, lng: 77.59 },
  },
  { _id: BERLIN_ID, name: 'Berlin', location: { lat: 52.52, lng: 13.4 } },
]

function inCity(cityId: Id<'cities'>, cityName: string) {
  return {
    ownerLocation: {
      kind: 'city' as const,
      cityId,
      cityName,
      regionLabel: null,
    },
  }
}

describe('getLandingMap', () => {
  it('shows the example until enough cities have builders', () => {
    expect(getLandingMap(undefined)).toEqual({ kind: 'example' })
    expect(
      getLandingMap(FIVE_CITIES.slice(0, LANDING_MAP_MIN_CITIES - 1)),
    ).toEqual({ kind: 'example' })
    // A city without builders never counts toward the threshold.
    expect(
      getLandingMap([
        ...FIVE_CITIES.slice(0, 4),
        city('empty', -33.87, 151.21, 0),
      ]),
    ).toEqual({ kind: 'example' })
  })

  it('plots one pin per city with builders once the threshold is met', () => {
    const map = getLandingMap(FIVE_CITIES)

    expect(map).toEqual({
      kind: 'cities',
      cityCount: 5,
      points: FIVE_CITIES.map(({ slug, lat, lng }) => ({ id: slug, lat, lng })),
      featured: FIVE_CITIES.slice(0, 3),
      cities: FIVE_CITIES,
    })
  })

  it('puts both sides of the antimeridian in one cell', () => {
    expect(getLatLngCell({ lat: 0, lng: 179.9 })).toBe(
      getLatLngCell({ lat: 0, lng: -179.9 }),
    )
    expect(getLatLngCell({ lat: 0, lng: 180 })).toBe(
      getLatLngCell({ lat: 0, lng: -180 }),
    )
    expect(getLatLngCell({ lat: 0, lng: 179.4 })).not.toBe(
      getLatLngCell({ lat: 0, lng: -179.4 }),
    )
  })

  it('keeps the busiest city when several fall in the same ~1° cell', () => {
    const whitefield = city('whitefield', 12.97, 77.75, 1)
    expect(getLatLngCell(whitefield)).toBe(getLatLngCell(FIVE_CITIES[0]))

    const map = getLandingMap([...FIVE_CITIES, whitefield])

    expect(map.kind === 'cities' && map.cityCount).toBe(6)
    expect(
      map.kind === 'cities' && map.points.map((point) => point.id),
    ).not.toContain('whitefield')
    expect(map.kind === 'cities' && map.points[0]?.id).toBe('bengaluru')
  })

  it('caps the pins while still counting every city', () => {
    // One city per distinct cell, well past the cap.
    const cities = Array.from({ length: 12 }, (_, row) =>
      Array.from({ length: 12 }, (_, col) =>
        city(`c-${row}-${col}`, 70 - row * 10, -175 + col * 25),
      ),
    ).flat()

    const map = getLandingMap(cities)

    expect(map.kind === 'cities' && map.cityCount).toBe(cities.length)
    expect(map.kind === 'cities' && map.points).toHaveLength(
      LANDING_MAP_MAX_PINS,
    )
  })
})

describe('HeroMapCaption', () => {
  it('names the busiest cities as links to their pages and counts the rest', () => {
    render(<HeroMapCaption map={getLandingMap(FIVE_CITIES)} />)

    expect(
      screen.getByRole('link', { name: 'bengaluru' }).getAttribute('href'),
    ).toBe('/c/bengaluru')
    expect(screen.getAllByRole('link')).toHaveLength(3)
    expect(screen.getByText(/on the map: builders in/).textContent).toBe(
      'on the map: builders in bengaluru, berlin, new-york and 2 more cities',
    )
    expect(screen.queryByText('example')).toBeNull()
  })

  it('labels the example map as an example', () => {
    render(<HeroMapCaption map={{ kind: 'example' }} />)

    expect(screen.getByText('example')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('getShowcaseCityIds', () => {
  it('collects each exact owner city once and skips the rest', () => {
    expect(
      getShowcaseCityIds([
        preview('a', 'alice', inCity(BENGALURU_ID, 'Bengaluru')),
        preview('b', 'bob', inCity(BENGALURU_ID, 'Bengaluru')),
        preview('c', 'carol', {
          ownerLocation: { kind: 'region', regionLabel: 'Karnataka' },
        }),
        preview('d', 'dan', { ownerLocation: { kind: 'none' } }),
        preview('e', 'erin'),
        preview('f', 'fay', inCity(BERLIN_ID, 'Berlin')),
      ]),
    ).toEqual([BENGALURU_ID, BERLIN_ID])
    expect(getShowcaseCityIds(undefined)).toEqual([])
  })
})

describe('getPingSequence', () => {
  it('uses the labelled example pings below the city threshold', () => {
    const items = getPingSequence({
      map: getLandingMap(FIVE_CITIES.slice(0, LANDING_MAP_MIN_CITIES - 1)),
      showcase: [preview('real', 'alice', inCity(BENGALURU_ID, 'Bengaluru'))],
      cities: CITY_DOCS,
    })

    expect(items).toEqual(EXAMPLE_PINGS)
    expect(items.length).toBeGreaterThanOrEqual(3)
    expect(items.every((item) => item.example)).toBe(true)
    // Example copy never names a person or a real repository.
    expect(items.some((item) => /alice|real/.test(item.headline))).toBe(false)
    // Every example is a different place, on a land dot of the globe.
    expect(new Set(items.map(getLatLngCell)).size).toBe(items.length)
    const land = decodeLandDots()
    for (const { lat, lng } of items) {
      expect(
        land.lat.some(
          (dotLat, index) =>
            Math.abs(dotLat - lat) <= 2 && Math.abs(land.lng[index] - lng) <= 2,
        ),
      ).toBe(true)
    }
  })

  it('pings showcase projects in order, on their exact city', () => {
    const items = getPingSequence({
      map: getLandingMap(FIVE_CITIES),
      showcase: [
        preview('portfolio', 'saroj', {
          ...inCity(BERLIN_ID, 'Berlin'),
          authorName: 'Saroj Pedada',
          authorAvatarUrl: 'https://avatars.example/saroj.png',
          latestUpdate: { kind: 'repo', at: 1_000 },
        }),
        preview('cli', 'bob', {
          ...inCity(BENGALURU_ID, 'Bengaluru'),
          authorName: 'Bob',
          latestUpdate: { kind: 'release', at: 2_000, label: 'v0.3' },
        }),
        preview('notes', 'carol', {
          ...inCity(BENGALURU_ID, 'Bengaluru'),
          authorName: 'Carol',
          latestUpdate: { kind: 'post', at: 3_000 },
        }),
      ],
      cities: CITY_DOCS,
    })

    expect(
      items.slice(0, 3).map(({ headline, place, at, example }) => ({
        headline,
        place,
        at,
        example,
      })),
    ).toEqual([
      {
        headline: 'Saroj pushed portfolio',
        place: 'Berlin',
        at: 1_000,
        example: false,
      },
      {
        headline: 'Bob released cli v0.3',
        place: 'Bengaluru',
        at: 2_000,
        example: false,
      },
      {
        headline: 'Carol posted in notes',
        place: 'Bengaluru',
        at: 3_000,
        example: false,
      },
    ])
    // Two showcase cells: a busy city in a third cell tops the cycle up.
    expect(items.slice(3).map((item) => item.place)).toEqual(['new-york'])
    expect(items[0]?.avatarUrl).toBe('https://avatars.example/saroj.png')
    // The ping sits on the city's own coordinates.
    expect({ lat: items[0]?.lat, lng: items[0]?.lng }).toEqual(
      CITY_DOCS[1].location,
    )
  })

  it('never pings region-only, hidden or unknown-city owners', () => {
    const items = getPingSequence({
      map: getLandingMap(FIVE_CITIES),
      showcase: [
        preview('region', 'rita', {
          ownerLocation: { kind: 'region', regionLabel: 'Karnataka' },
        }),
        preview('hidden', 'hal', { ownerLocation: { kind: 'none' } }),
        preview('nosignal', 'nate'),
        preview('gone', 'gus', inCity(UNKNOWN_ID, 'Atlantis')),
        preview('shipit', 'bob', inCity(BENGALURU_ID, 'Bengaluru')),
      ],
      cities: CITY_DOCS,
    })

    const headlines = items.map((item) => item.headline)
    // No latest update: the project is shared, not claimed as a push.
    expect(headlines[0]).toBe('bob shared shipit')
    expect(
      headlines.some((headline) => /rita|hal|nate|gus|Atlantis/.test(headline)),
    ).toBe(false)
    expect(items.map((item) => item.place)).not.toContain('Atlantis')
  })

  it('falls back to the busiest cities when no showcase project has a city', () => {
    const items = getPingSequence({
      map: getLandingMap(FIVE_CITIES),
      showcase: [],
      cities: [],
    })

    expect(
      items.map(({ place, headline, at }) => ({ place, headline, at })),
    ).toEqual([
      { place: 'bengaluru', headline: '9 builders', at: null },
      { place: 'berlin', headline: '6 builders', at: null },
      { place: 'new-york', headline: '4 builders', at: null },
    ])
    expect(items[0]).toMatchObject({
      lat: FIVE_CITIES[0].lat,
      lng: FIVE_CITIES[0].lng,
    })
    expect(items.every((item) => !item.example)).toBe(true)
  })

  it('tops up with busy cities in cells that are not already pinged', () => {
    const items = getPingSequence({
      map: getLandingMap(FIVE_CITIES),
      showcase: [preview('shipit', 'bob', inCity(BENGALURU_ID, 'Bengaluru'))],
      cities: CITY_DOCS,
    })

    // Bengaluru already pings for the project, so the city tops up skip it.
    expect(items.map((item) => item.place)).toEqual([
      'Bengaluru',
      'berlin',
      'new-york',
    ])
  })

  it('tops up past the featured cities when the busiest ones share one cell', () => {
    // Three Bengaluru-area cities lead by builders and share one ~1° cell.
    const cities = [
      city('blr-central', 12.97, 77.59, 9),
      city('blr-north', 12.98, 77.6, 8),
      city('blr-south', 12.96, 77.58, 7),
      city('berlin', 52.52, 13.4, 6),
      city('new-york', 40.71, -74.0, 4),
    ]
    const cell = getLatLngCell(cities[0])
    expect(getLatLngCell(cities[1])).toBe(cell)
    expect(getLatLngCell(cities[2])).toBe(cell)

    const items = getPingSequence({
      map: getLandingMap(cities),
      showcase: [],
      cities: [],
    })

    expect(items.map(({ place, headline }) => ({ place, headline }))).toEqual([
      { place: 'blr-central', headline: '9 builders' },
      { place: 'berlin', headline: '6 builders' },
      { place: 'new-york', headline: '4 builders' },
    ])
  })

  it('tops up with busy cities when every showcase owner shares one cell', () => {
    const items = getPingSequence({
      map: getLandingMap(FIVE_CITIES),
      showcase: ['a', 'b', 'c', 'd'].map((repo) =>
        preview(repo, repo, inCity(BENGALURU_ID, 'Bengaluru')),
      ),
      cities: CITY_DOCS,
    })

    expect(items.map((item) => item.place)).toEqual([
      'Bengaluru',
      'Bengaluru',
      'Bengaluru',
      'Bengaluru',
      'berlin',
      'new-york',
    ])
  })
})

describe('getLandingCityDots', () => {
  it('draws every plotted city, and none for the example map', () => {
    const map = getLandingMap(FIVE_CITIES)

    expect(getLandingCityDots(map)).toEqual(
      FIVE_CITIES.map(({ slug, lat, lng }) => ({ key: slug, lat, lng })),
    )
    expect(getLandingCityDots({ kind: 'example' })).toEqual([])
  })
})
