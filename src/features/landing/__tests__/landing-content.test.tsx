// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { Id } from '../../../../convex/_generated/dataModel'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    search,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode
    params?: Record<string, string>
    search?: Record<string, string>
    to: string
  }) => {
    const path = to.replace(
      /\$(\w+)/g,
      (_match, key: string) => params?.[key] ?? '',
    )
    const query = new URLSearchParams(search).toString()
    return (
      <a href={query ? `${path}?${query}` : path} {...props}>
        {children}
      </a>
    )
  },
}))

import { HeroMapCaption } from '../hero-map-caption'
import {
  LANDING_MAP_MAX_PINS,
  LANDING_MAP_MIN_CITIES,
  getLandingCityDots,
  getLandingMap,
  getLatLngCell,
  getPingSequence,
  type ActiveMapCity,
  type LandingActivity,
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

const BERLIN = { name: 'Berlin', slug: 'berlin', lat: 52.52, lng: 13.4 }
const BENGALURU = {
  name: 'Bengaluru',
  slug: 'bengaluru',
  lat: 12.97,
  lng: 77.59,
}

function base(
  key: string,
  at: number,
  actorName: string,
  repo: string,
  where = BERLIN,
) {
  const handle = actorName.split(' ')[0]?.toLowerCase() ?? actorName
  return {
    key,
    at,
    actor: {
      name: actorName,
      handle,
      avatarUrl: `https://avatars.example/${handle}.png`,
    },
    project: { owner: handle, repo, description: `${repo} does one thing` },
    city: where,
  }
}

type ActivityOf<Kind extends LandingActivity['kind']> = Extract<
  LandingActivity,
  { kind: Kind }
>

const POST: ActivityOf<'post'> = {
  ...base('post:1', 3_000, 'Saroj Pedada', 'portfolio'),
  kind: 'post',
  postId: 'post_1' as Id<'posts'>,
  excerpt: 'shipped dark mode',
}
const RELEASE: ActivityOf<'release'> = {
  ...base('release:1', 2_000, 'Bob', 'cli', BENGALURU),
  kind: 'release',
  releaseId: 'release_1' as Id<'project_releases'>,
  tag: 'v0.3',
  name: 'Faster startup',
}
const PROJECT: ActivityOf<'project'> = {
  ...base('project:1', 1_000, 'Carol', 'notes', BENGALURU),
  kind: 'project',
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
    expect(screen.getByText(/^on the map: builders in/).textContent).toBe(
      'on the map: builders in bengaluru, berlin, new-york and 2 more cities',
    )
  })

  it('renders nothing while there is no city map', () => {
    const { container } = render(
      <HeroMapCaption map={{ kind: 'example' }} />,
    )

    expect(container.innerHTML).toBe('')
  })
})

describe('getPingSequence', () => {
  it('pings nothing while there is no activity: nothing is invented', () => {
    expect(getPingSequence([])).toEqual([])
    expect(getPingSequence(undefined)).toEqual([])
  })

  it('pings each item in order, on its city, leading to what it describes', () => {
    const items = getPingSequence([POST, RELEASE, PROJECT])

    expect(items).toEqual([
      {
        key: 'post:1',
        kind: 'post',
        lat: BERLIN.lat,
        lng: BERLIN.lng,
        headline: 'Saroj posted in portfolio',
        detail: 'shipped dark mode',
        place: 'Berlin',
        at: 3_000,
        avatarUrl: 'https://avatars.example/saroj.png',
        link: { owner: 'saroj', repo: 'portfolio', search: { post: 'post_1' } },
      },
      {
        key: 'release:1',
        kind: 'release',
        lat: BENGALURU.lat,
        lng: BENGALURU.lng,
        headline: 'Bob released cli v0.3',
        detail: 'Faster startup',
        place: 'Bengaluru',
        at: 2_000,
        avatarUrl: 'https://avatars.example/bob.png',
        link: { owner: 'bob', repo: 'cli', search: { release: 'release_1' } },
      },
      {
        key: 'project:1',
        kind: 'project',
        lat: BENGALURU.lat,
        lng: BENGALURU.lng,
        headline: 'Carol shared notes',
        detail: 'notes does one thing',
        place: 'Bengaluru',
        at: 1_000,
        avatarUrl: 'https://avatars.example/carol.png',
        link: { owner: 'carol', repo: 'notes', search: {} },
      },
    ])
  })

  it('skips a release name that only repeats its tag, and an empty excerpt', () => {
    const [release, post] = getPingSequence([
      { ...RELEASE, name: 'v0.3' },
      { ...POST, excerpt: '' },
    ])

    expect(release?.detail).toBeNull()
    expect(post?.detail).toBeNull()
  })

  it('pings a push as shipped, leading to its project', () => {
    const [item] = getPingSequence([
      { ...base('push:1', 4_000, 'Dana', 'engine'), kind: 'push' },
    ])

    expect(item).toMatchObject({
      kind: 'push',
      headline: 'Dana shipped engine',
      detail: 'engine does one thing',
      place: 'Berlin',
      link: { owner: 'dana', repo: 'engine', search: {} },
    })
  })

  it('falls back to the handle when the display name is blank', () => {
    const [item] = getPingSequence([
      { ...PROJECT, actor: { ...PROJECT.actor, name: '  ' } },
    ])

    expect(item?.headline).toBe('carol shared notes')
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
