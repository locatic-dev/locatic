// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { Id } from '../../../../convex/_generated/dataModel'
import type { ProjectCardPreview } from '@/features/contracts'
import {
  getLandDots,
  projectToMaskCell,
  toMaskFraction,
} from '@/components/ui/dot-map'

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

  it('keeps the busiest city when several land on the same map dot', () => {
    const mysuru = city('mysuru', 12.3, 76.64, 1)
    expect(projectToMaskCell(mysuru)).toEqual(projectToMaskCell(FIVE_CITIES[0]))

    const map = getLandingMap([...FIVE_CITIES, mysuru])

    expect(map.kind === 'cities' && map.cityCount).toBe(6)
    expect(
      map.kind === 'cities' && map.points.map((point) => point.id),
    ).not.toContain('mysuru')
    expect(map.kind === 'cities' && map.points[0]?.id).toBe('bengaluru')
  })

  it('caps the pins while still counting every city', () => {
    // One city per distinct map dot, well past the cap.
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
    // Every example pings a land dot.
    const land = getLandDots(430, 150)
    for (const { x, y } of items) {
      expect(
        land.some(
          (dot) =>
            Math.abs(dot.x - x * 430) < 0.01 &&
            Math.abs(dot.y - y * 150) < 0.01,
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
    // Two showcase dots: a busy city on a third dot tops the cycle up.
    expect(items.slice(3).map((item) => item.place)).toEqual(['new-york'])
    expect(items[0]?.avatarUrl).toBe('https://avatars.example/saroj.png')
    // Mask coordinates are the city's dot.
    expect({ x: items[0]?.x, y: items[0]?.y }).toEqual(
      toMaskFraction(CITY_DOCS[1].location),
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
    expect(items[0]).toMatchObject(toMaskFraction(FIVE_CITIES[0]))
    expect(items.every((item) => !item.example)).toBe(true)
  })

  it('tops up with busy cities on dots that are not already pinged', () => {
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

  it('tops up past the featured cities when the busiest ones share one dot', () => {
    // Three Bengaluru-area cities lead by builders and land on one mask dot.
    const cities = [
      city('blr-central', 12.97, 77.59, 9),
      city('blr-north', 12.98, 77.6, 8),
      city('blr-south', 12.96, 77.58, 7),
      city('berlin', 52.52, 13.4, 6),
      city('new-york', 40.71, -74.0, 4),
    ]
    const cell = projectToMaskCell(cities[0])
    expect(projectToMaskCell(cities[1])).toEqual(cell)
    expect(projectToMaskCell(cities[2])).toEqual(cell)

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

  it('tops up with busy cities when every showcase owner shares one dot', () => {
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
      FIVE_CITIES.map((city) => ({ key: city.slug, ...toMaskFraction(city) })),
    )
    expect(getLandingCityDots({ kind: 'example' })).toEqual([])
  })
})
