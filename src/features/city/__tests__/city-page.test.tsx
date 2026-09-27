// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { Id } from '../../../../convex/_generated/dataModel'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params = {},
    search,
    to,
    hash: _hash,
    preload: _preload,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode
    params?: Record<string, string>
    search?: Record<string, unknown>
    to: string
    hash?: string
    preload?: string
  }) => (
    <a
      href={to.replace(/\$(\w+)/g, (_match, key: string) => params[key] ?? '')}
      data-search={search ? JSON.stringify(search) : undefined}
      {...props}
    >
      {children}
    </a>
  ),
  useRouter: () => ({ navigate: vi.fn(), preloadRoute: vi.fn() }),
}))

import { CityPageView } from '../city-sections'
import { formatCityCounts, isCityPageEmpty } from '../copy'
import type { CityPagePayload } from '../types'

const cityId = 'city_mysuru' as Id<'cities'>
const bengaluruId = 'city_blr' as Id<'cities'>

function emptyPage(overrides: Partial<CityPagePayload> = {}): CityPagePayload {
  return {
    city: {
      cityId,
      slug: 'mysuru-in',
      name: 'Mysuru',
      displayName: 'Mysuru, Karnataka, India',
      regionLabel: 'Karnataka, India',
      location: { lat: 12.2958, lng: 76.6394 },
    },
    stats: { builderCount: 0, projectCount: 0, lastActivityAt: null },
    recentWork: { projects: [], hasMore: false },
    builders: [],
    posts: [],
    nearby: [],
    ...overrides,
  }
}

const nearbyBengaluru = {
  cityId: bengaluruId,
  slug: 'bengaluru-in',
  name: 'Bengaluru',
  regionLabel: 'Karnataka, India',
  location: { lat: 12.9716, lng: 77.5946 },
  builderCount: 3,
  projectCount: 4,
  distanceKm: 128,
}

const builder = {
  userId: 'user_alice' as Id<'users'>,
  displayName: 'Alice',
  avatarUrl: null,
  githubUsername: 'alice',
  buildStatus: 'open_to_collab' as const,
  location: {
    kind: 'city' as const,
    cityId,
    cityName: 'Mysuru, Karnataka, India',
    regionLabel: 'Karnataka, India',
  },
  projectsCount: 2,
  isNewBuilder: true,
}

const project = {
  projectId: 'project_1' as Id<'projects'>,
  ownerUserId: builder.userId,
  fullName: 'alice/city-notes',
  owner: 'alice',
  repo: 'city-notes',
  description: 'Notes for the city',
  primaryLanguage: 'TypeScript',
  languages: [{ name: 'TypeScript', bytes: 100 }],
  githubStars: 0,
  locaticLikes: 0,
  reactionCounts: {},
  commentsCount: 0,
  postsCount: 0,
  topics: [],
  lastCommitAt: Date.UTC(2026, 8, 1),
  updatedAt: Date.UTC(2026, 8, 1),
  authorName: 'Alice',
  authorHandle: 'alice',
  authorAvatarUrl: null,
  cityLabel: 'Mysuru, Karnataka, India',
  cityVisibilityState: 'exact_city' as const,
}

const post = {
  postId: 'post_1' as Id<'posts'>,
  body: 'Shipped offline maps',
  createdAt: Date.UTC(2026, 8, 1),
  commentsCount: 0,
  project: {
    name: 'city-notes',
    fullName: 'alice/city-notes',
    ownerLogin: 'alice',
  },
  author: {
    userId: builder.userId,
    displayName: 'Alice',
    avatarUrl: null,
    githubUsername: 'alice',
    buildStatus: 'open_to_collab' as const,
    location: builder.location,
  },
}

describe('formatCityCounts', () => {
  it('states zeros and singulars truthfully', () => {
    expect(formatCityCounts({ builderCount: 0, projectCount: 0 })).toBe(
      '0 builders, 0 projects',
    )
    expect(formatCityCounts({ builderCount: 1, projectCount: 1 })).toBe(
      '1 builder, 1 project',
    )
  })
})

describe('CityPageView', () => {
  it('renders an empty city with its name, zero counts and nearby cities as a map and a list', () => {
    render(<CityPageView page={emptyPage({ nearby: [nearbyBengaluru] })} />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Mysuru' }),
    ).toBeTruthy()
    expect(screen.getByText('Karnataka, India')).toBeTruthy()
    expect(screen.getByText('0 builders, 0 projects')).toBeTruthy()
    expect(
      screen.getByRole('heading', { name: 'no public work in Mysuru yet.' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('img', { name: 'map of Mysuru and 1 nearby city' }),
    ).toBeTruthy()
    const nearby = screen.getByRole('link', { name: /^Bengaluru/ })
    expect(nearby.getAttribute('href')).toBe('/c/bengaluru-in')
    expect(nearby.textContent).toContain('3 builders, 4 projects')
    expect(nearby.textContent).toContain('128 km away')
    expect(screen.queryByRole('link', { name: 'browse everywhere' })).toBeNull()
  })

  it('offers browse everywhere when no nearby city has public work', () => {
    render(<CityPageView page={emptyPage()} />)

    const everywhere = screen.getByRole('link', { name: 'browse everywhere' })
    expect(everywhere.getAttribute('href')).toBe('/explore')
    expect(JSON.parse(everywhere.getAttribute('data-search') ?? '{}')).toEqual(
      expect.objectContaining({ scope: 'global' }),
    )
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('fills recent work, builders and posts, without rank numbers', () => {
    const page = emptyPage({
      stats: { builderCount: 1, projectCount: 1, lastActivityAt: null },
      recentWork: { projects: [project], hasMore: true },
      builders: [builder],
      posts: [post],
    })
    expect(isCityPageEmpty(page)).toBe(false)

    render(<CityPageView page={page} />)

    for (const name of ['recent work', 'builders', 'recent posts']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy()
    }
    expect(screen.queryByText(/no public work in/)).toBeNull()
    const builders = screen.getByRole('region', { name: 'builders' })
    const alice = within(builders).getAllByRole('link', { name: /Alice/ })[0]
    expect(alice?.getAttribute('href')).toBe('/u/alice')
    expect(builders.textContent).toContain('new builder')
    expect(builders.textContent).toContain('most recent public work first')
    expect(builders.textContent).not.toMatch(/#\s?\d/)
    const more = screen.getByRole('link', {
      name: 'more from Mysuru in explore',
    })
    expect(JSON.parse(more.getAttribute('data-search') ?? '{}')).toEqual(
      expect.objectContaining({ scope: 'custom', selectedCityIds: [cityId] }),
    )
    const posts = screen.getByRole('region', { name: 'recent posts' })
    expect(posts.textContent).toContain('Shipped offline maps')
    expect(
      within(posts)
        .getByRole('link', { name: 'alice/city-notes' })
        .getAttribute('href'),
    ).toBe('/project/alice/city-notes')
  })
})
