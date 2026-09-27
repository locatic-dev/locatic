// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { Id } from '../../../../convex/_generated/dataModel'
import type { ProjectCardPreview } from '@/features/contracts'
import { projectToMaskCell } from '@/components/ui/dot-map'

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
  LANDING_MAP_MAX_PINS,
  LANDING_MAP_MIN_CITIES,
  getLandingMap,
  type ActiveMapCity,
} from '../landing-content'
import { RepoPreviewCard } from '../repo-preview-card'

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

function preview(repo: string, owner = 'alice'): ProjectCardPreview {
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

describe('RepoPreviewCard', () => {
  it('links real projects to their pages and builders, without the example label', () => {
    render(
      <RepoPreviewCard
        projects={[preview('city-notes'), preview('shipit', 'bob')]}
      />,
    )

    expect(
      screen
        .getByRole('link', { name: 'alice/city-notes' })
        .getAttribute('href'),
    ).toBe('/project/alice/city-notes')
    expect(
      screen.getByRole('link', { name: '@bob' }).getAttribute('href'),
    ).toBe('/u/bob')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getAllByText('updated 2h ago')).toHaveLength(2)
    expect(screen.queryByText('example')).toBeNull()
  })

  it('falls back to the labelled example when there is no public project', () => {
    render(<RepoPreviewCard projects={[]} />)

    expect(screen.getByText('example')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
