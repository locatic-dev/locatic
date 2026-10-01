// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { useState } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Doc, Id } from '../../../../../convex/_generated/dataModel'
import type { BuilderPreview, ExploreCityChip } from '../../types'
import {
  EXPLORE_CITY_INPUT_ID,
  ExploreRail,
  type ExploreRailProps,
} from '../explore-rail'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params = {},
    to,
    search: _search,
    preload: _preload,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode
    params?: Record<string, string>
    search?: unknown
    preload?: string
    to: string
  }) => (
    <a
      href={to.replace(/\$(\w+)/g, (_match, key: string) => params[key] ?? '')}
      {...props}
    >
      {children}
    </a>
  ),
}))

const NOW = Date.UTC(2026, 8, 30, 12)
const HOUR = 60 * 60 * 1000
const CITY_ID = 'city_hyd' as Id<'cities'>

const hyderabad: ExploreCityChip = {
  id: CITY_ID,
  name: 'Hyderabad, Telangana, India',
  shortName: 'Hyderabad',
}

function builder(name: string, overrides: Partial<BuilderPreview> = {}) {
  return {
    userId: `user_${name}` as Id<'users'>,
    displayName: name,
    githubUsername: name.toLowerCase(),
    avatarUrl: undefined,
    buildStatus: undefined,
    location: { kind: 'none' },
    projectsCount: 3,
    followersCount: 0,
    isNewBuilder: false,
    ...overrides,
  } as BuilderPreview
}

function railProps(overrides: Partial<ExploreRailProps> = {}) {
  return {
    mode: 'projects',
    railCityId: CITY_ID,
    cityStats: { builderCount: 142, projectCount: 40, lastActivityAt: null },
    nearbyCities: [],
    nearbyBuilders: [builder('Mira')],
    selectedCityChips: [hyderabad],
    availableCities: [] as Array<Doc<'cities'>>,
    cityQuery: '',
    citySearchPending: false,
    onCityQueryChange: vi.fn(),
    onAddCity: vi.fn(),
    onRemoveCity: vi.fn(),
    onSwitchCity: vi.fn(),
    filters: {},
    onFiltersChange: vi.fn(),
    onResetExplore: vi.fn(),
    resetPending: false,
    followOverrides: {},
    followedUserIds: new Set<string>(),
    pendingFollows: new Set<string>(),
    onFollowUser: vi.fn(),
    ...overrides,
  } satisfies ExploreRailProps
}

function renderRail(overrides: Partial<ExploreRailProps> = {}) {
  const props = railProps(overrides)
  return {
    props,
    ...render(<ExploreRail placement="rail" {...props} />),
  }
}

describe('ExploreRail', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is a labelled landmark with a heading per section', () => {
    renderRail({
      nearbyCities: [
        {
          cityId: 'city_blr' as Id<'cities'>,
          slug: 'bengaluru-in',
          name: 'Bengaluru',
          regionLabel: 'Karnataka, India',
          location: { lat: 12.97, lng: 77.59 },
          builderCount: 12,
          projectCount: 30,
          distanceKm: 500,
        },
      ],
    })

    const rail = screen.getByRole('complementary', { name: 'explore filters' })
    expect(
      within(rail)
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['city', 'filters', 'active nearby', 'nearby cities'])
  })

  it('calls the builders "active builders" without a city', () => {
    renderRail({ railCityId: null, cityStats: null, selectedCityChips: [] })

    expect(
      screen.getByRole('heading', { name: 'active builders' }),
    ).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'active nearby' })).toBeNull()
  })

  it('shows the city with builder and project counts from its stats', () => {
    renderRail()

    expect(screen.getByText('Hyderabad')).toBeTruthy()
    expect(screen.getByText('142 builders · 40 projects')).toBeTruthy()
  })

  it.each([
    ['23h ago', NOW - 23 * HOUR, true],
    ['25h ago', NOW - 25 * HOUR, false],
  ])(
    'marks the city live only for activity in the last 24h (%s)',
    (_name, lastActivityAt, live) => {
      renderRail({
        cityStats: { builderCount: 3, projectCount: 4, lastActivityAt },
      })

      expect(screen.getByText(/^last active/)).toBeTruthy()
      expect(
        Boolean(screen.queryByRole('img', { name: 'active in the last 24h' })),
      ).toBe(live)
    },
  )

  it('leaves the clock-relative age and live dot out of the server render', () => {
    const html = renderToString(
      <ExploreRail
        placement="rail"
        {...railProps({
          cityStats: {
            builderCount: 3,
            projectCount: 4,
            lastActivityAt: NOW - HOUR,
          },
        })}
      />,
    )

    expect(html).toContain('3 builders')
    expect(html).not.toContain('last active')
    expect(html).not.toContain('active in the last 24h')
  })

  it('says everywhere without a city and several cities by count', () => {
    const { rerender, props } = renderRail({
      railCityId: null,
      cityStats: null,
      selectedCityChips: [],
    })
    expect(screen.getByText('everywhere')).toBeTruthy()

    rerender(
      <ExploreRail
        placement="rail"
        {...props}
        selectedCityChips={[
          hyderabad,
          { id: 'city_blr', name: 'Bengaluru', shortName: 'Bengaluru' },
        ]}
      />,
    )
    expect(screen.getByText('2 cities')).toBeTruthy()
  })

  it('exposes the city chips and a compact add affordance', () => {
    const { props } = renderRail()

    const cityInput = screen.getByLabelText('Add a city filter')
    expect(cityInput.id).toBe(EXPLORE_CITY_INPUT_ID)
    expect(cityInput.getAttribute('placeholder')).toBe('+ add city')

    fireEvent.click(screen.getByLabelText('Remove Hyderabad, Telangana, India'))
    expect(props.onRemoveCity).toHaveBeenCalledWith(CITY_ID)
  })

  it('says while the city search runs and when nothing matches', () => {
    const { props, rerender } = renderRail({
      cityQuery: 'zzz',
      citySearchPending: true,
    })
    fireEvent.focus(screen.getByLabelText('Add a city filter'))
    expect(screen.getByRole('status').textContent).toBe('searching…')

    rerender(
      <ExploreRail placement="rail" {...props} citySearchPending={false} />,
    )
    expect(screen.getByRole('status').textContent).toBe('no cities match')
  })

  it('sets a canonical language filter from a quick-pick and reports it as pressed', () => {
    const { props, rerender } = renderRail()

    const typescript = screen.getByRole('button', { name: 'TypeScript' })
    expect(typescript.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(typescript)
    expect(props.onFiltersChange).toHaveBeenCalledWith({
      language: 'typescript',
    })

    rerender(
      <ExploreRail
        placement="rail"
        {...props}
        filters={{ language: 'typescript' }}
      />,
    )
    const pressed = screen.getByRole('button', { name: 'TypeScript' })
    expect(pressed.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(pressed)
    expect(props.onFiltersChange).toHaveBeenLastCalledWith({
      language: undefined,
    })
  })

  it('applies primary language and topic in their canonical form', () => {
    const { props } = renderRail()

    fireEvent.click(screen.getByRole('button', { name: 'filter' }))
    fireEvent.change(screen.getByLabelText('primary language'), {
      target: { value: '  TypeScript ' },
    })
    fireEvent.change(screen.getByLabelText('topic'), {
      target: { value: 'AI/Agents' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'apply' }))

    expect(props.onFiltersChange).toHaveBeenCalledWith({
      language: 'typescript',
      topic: 'ai-agents',
    })
  })

  it('shows applied filters as removable chips', () => {
    const { props } = renderRail({
      filters: { language: 'rust', topic: 'webgpu' },
    })

    expect(screen.getByText('primary language: rust')).toBeTruthy()
    expect(screen.getByText('topic: #webgpu')).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove topic filter webgpu' }),
    )
    expect(props.onFiltersChange).toHaveBeenCalledWith({ topic: undefined })
  })

  it('offers open to collab in builders mode only and hides active nearby there', () => {
    const { props, rerender } = renderRail({ mode: 'builders' })

    const chip = screen.getByRole('button', { name: 'open to collab' })
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('button', { name: 'TypeScript' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'active nearby' })).toBeNull()
    fireEvent.click(chip)
    expect(props.onFiltersChange).toHaveBeenCalledWith({ openToCollab: true })

    rerender(<ExploreRail placement="rail" {...props} mode="posts" />)
    expect(screen.queryByRole('button', { name: 'open to collab' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'filter' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'active nearby' })).toBeTruthy()
  })

  it('offers reset dismissed to members in resettable modes only', () => {
    const { props, rerender } = renderRail({ mode: 'posts' })

    fireEvent.click(screen.getByRole('button', { name: 'reset dismissed' }))
    expect(props.onResetExplore).toHaveBeenCalledTimes(1)

    rerender(<ExploreRail placement="rail" {...props} mode="builders" />)
    expect(screen.queryByRole('button', { name: 'reset dismissed' })).toBeNull()

    rerender(
      <ExploreRail
        placement="rail"
        {...props}
        mode="posts"
        onResetExplore={undefined}
      />,
    )
    expect(screen.queryByRole('button', { name: 'reset dismissed' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'filters' })).toBeNull()
  })

  it('lists active builders with their handle and follows them', () => {
    const { props, rerender } = renderRail({
      nearbyBuilders: [builder('Mira'), builder('Dev', { projectsCount: 1 })],
    })

    expect(screen.getByText('@mira · 3 projects')).toBeTruthy()
    expect(screen.getByText('@dev · 1 project')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /Mira/ }).getAttribute('href'),
    ).toBe('/u/mira')

    fireEvent.click(screen.getByRole('button', { name: 'follow Mira' }))
    expect(props.onFollowUser).toHaveBeenCalledWith(
      'user_Mira',
      'user_Mira',
      false,
    )

    rerender(
      <ExploreRail
        placement="rail"
        {...props}
        followOverrides={{ user_Mira: true }}
      />,
    )
    expect(screen.getByRole('button', { name: 'following Mira' })).toBeTruthy()
  })

  it('offers no follow on the viewer’s own row', () => {
    renderRail({ viewerId: 'user_Mira' as Id<'users'> })

    expect(screen.getByText('@mira · 3 projects')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /follow/ })).toBeNull()
  })

  it('gives visitors sign-in links, not follow buttons', () => {
    renderRail({
      onResetExplore: undefined,
      visitor: { signInRedirect: '/explore' },
    })

    expect(
      screen.getByRole('link', { name: 'Sign in to follow Mira' }),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: /follow/ })).toBeNull()
  })

  it('switches to a nearby city on click and keeps focus in the rail', () => {
    const { props, rerender } = renderRail({
      nearbyCities: [
        {
          cityId: 'city_blr' as Id<'cities'>,
          slug: 'bengaluru-in',
          name: 'Bengaluru',
          regionLabel: 'Karnataka, India',
          location: { lat: 12.97, lng: 77.59 },
          builderCount: 12,
          projectCount: 30,
          distanceKm: 500,
        },
      ],
    })

    expect(screen.getByText('12 builders · 500 km')).toBeTruthy()
    const nearby = screen.getByRole('button', { name: /Bengaluru/ })
    nearby.focus()
    fireEvent.click(nearby)
    expect(props.onSwitchCity).toHaveBeenCalledWith(
      expect.objectContaining({ cityId: 'city_blr', name: 'Bengaluru' }),
    )

    // The new city's nearby list is loading, so the clicked row is gone.
    rerender(<ExploreRail placement="rail" {...props} nearbyCities={[]} />)
    expect(screen.queryByRole('button', { name: /Bengaluru/ })).toBeNull()
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 2, name: 'city' }),
    )
  })

  it('renders no nearby cities block without rows or without a single city', () => {
    const { props, rerender } = renderRail({ nearbyCities: [] })
    expect(screen.queryByRole('heading', { name: 'nearby cities' })).toBeNull()

    rerender(
      <ExploreRail
        placement="rail"
        {...props}
        railCityId={null}
        nearbyCities={[
          {
            cityId: 'city_blr' as Id<'cities'>,
            slug: 'bengaluru-in',
            name: 'Bengaluru',
            regionLabel: null,
            location: { lat: 12.97, lng: 77.59 },
            builderCount: 12,
            projectCount: 30,
            distanceKm: 500,
          },
        ]}
      />,
    )
    expect(screen.queryByRole('heading', { name: 'nearby cities' })).toBeNull()
  })

  it('uses h3 headings and no landmark in the sheet placement', () => {
    render(<ExploreRail placement="sheet" {...railProps()} />)

    expect(screen.queryByRole('complementary')).toBeNull()
    expect(screen.getByRole('heading', { level: 3, name: 'city' })).toBeTruthy()
    expect(screen.getByLabelText('Add a city filter').id).toBe(
      `${EXPLORE_CITY_INPUT_ID}-sheet`,
    )
  })

  it('moves focus to the city field of the same placement when a city chip is removed', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    function Both() {
      const [chips, setChips] = useState<ExploreCityChip[]>([hyderabad])
      const props = railProps({
        selectedCityChips: chips,
        onRemoveCity: (cityId) =>
          setChips((current) => current.filter((chip) => chip.id !== cityId)),
      })
      return (
        <>
          <ExploreRail placement="rail" {...props} />
          <div role="dialog" aria-label="filters">
            <ExploreRail placement="sheet" {...props} />
          </div>
        </>
      )
    }
    render(<Both />)

    const sheet = screen.getByRole('dialog', { name: 'filters' })
    await user.click(
      within(sheet).getByRole('button', {
        name: 'Remove Hyderabad, Telangana, India',
      }),
    )

    expect(document.activeElement).toBe(
      within(sheet).getByLabelText('Add a city filter'),
    )
  })
})
