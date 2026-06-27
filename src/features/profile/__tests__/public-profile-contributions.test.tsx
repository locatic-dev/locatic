// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  PublicProfileContributionGraph,
  PublicProfileContributionsList,
} from '../public-profile-contributions'

describe('public profile contributions surfaces', () => {
  it('renders the contribution graph independently of contribution detail visibility', () => {
    render(
      <PublicProfileContributionGraph
        githubContributions={{
          totalContributions: 17,
          weeks: [{ days: [{ count: 3, date: '2026-06-01' }] }],
        }}
      />,
    )

    expect(screen.getByText('17 contributions this year')).toBeTruthy()
    expect(
      screen.getByLabelText('17 GitHub contributions in the last year'),
    ).toBeTruthy()
  })

  it('renders the empty contribution list state', () => {
    render(<PublicProfileContributionsList contributions={[]} visible />)

    expect(screen.getByText('no public contributions yet.')).toBeTruthy()
  })

  it('renders the private contribution details state', () => {
    render(
      <PublicProfileContributionsList contributions={[]} visible={false} />,
    )

    expect(
      screen.getByText('contributions are private on this profile.'),
    ).toBeTruthy()
    expect(screen.queryByText('no public contributions yet.')).toBeNull()
  })
})
