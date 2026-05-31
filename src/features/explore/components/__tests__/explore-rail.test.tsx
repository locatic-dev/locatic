// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { ExploreRail } from '../explore-rail'
import type { BuilderPreview } from '../../types'

vi.mock('@/lib/icons', () => ({
  MapPin: () => <svg aria-hidden="true" />,
  X: () => <svg aria-hidden="true" />,
}))

const builder = {
  userId: 'user_1' as Id<'users'>,
  displayName: 'Saketha Rama',
  avatarUrl: null,
  githubUsername: 'bv-saketha-rama',
  cityId: 'city_bengaluru' as Id<'cities'>,
  cityName: 'Bengaluru, Karnataka, India',
  projectsCount: 2,
  followersCount: 5,
} satisfies BuilderPreview

describe('ExploreRail', () => {
  it('renders selected-city copy, city metadata, and follow state', () => {
    render(
      <ExploreRail
        compact
        followOverrides={{}}
        followedUserIds={new Set(['user_1'])}
        hasSelectedCities
        nearbyBuilders={[builder]}
        onFollowBuilder={vi.fn()}
        onMessageBuilder={() => vi.fn()}
        onOpenBuilderProfile={vi.fn()}
        onRemoveCity={vi.fn()}
        pendingFollows={new Set()}
        pendingUserId={null}
        selectedCityChips={[{ id: 'city_bengaluru', name: 'Bengaluru' }]}
        viewerId={'viewer_1' as Id<'users'>}
      />,
    )

    expect(
      screen.getByText('Builders from the active city context.', {
        exact: false,
      }),
    ).toBeTruthy()
    expect(screen.getByText(/Bengaluru, Karnataka, India/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'following' })).toBeTruthy()
  })

  it('hides follow and message actions for the viewer', () => {
    render(
      <ExploreRail
        compact
        followOverrides={{}}
        followedUserIds={new Set()}
        hasSelectedCities
        nearbyBuilders={[builder]}
        onFollowBuilder={vi.fn()}
        onMessageBuilder={() => undefined}
        onOpenBuilderProfile={vi.fn()}
        onRemoveCity={vi.fn()}
        pendingFollows={new Set()}
        pendingUserId={null}
        selectedCityChips={[{ id: 'city_bengaluru', name: 'Bengaluru' }]}
        viewerId={'user_1' as Id<'users'>}
      />,
    )

    expect(screen.queryByRole('button', { name: 'follow' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'message' })).toBeNull()
    expect(screen.getByText(/you/)).toBeTruthy()
  })

  it('renders global empty copy and city chip removal', () => {
    const removeCity = vi.fn()
    render(
      <ExploreRail
        compact
        followOverrides={{}}
        followedUserIds={new Set()}
        hasSelectedCities={false}
        nearbyBuilders={[]}
        onFollowBuilder={vi.fn()}
        onMessageBuilder={() => undefined}
        onOpenBuilderProfile={vi.fn()}
        onRemoveCity={removeCity}
        pendingFollows={new Set()}
        pendingUserId={null}
        selectedCityChips={[{ id: 'city_bengaluru', name: 'Bengaluru' }]}
      />,
    )

    expect(
      screen.getByText('add a city filter to see nearby builders.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Bengaluru' }))
    expect(removeCity).toHaveBeenCalledWith('city_bengaluru')
  })
})
