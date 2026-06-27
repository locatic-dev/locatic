// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  PublicProfileContributionGraph,
  PublicProfileContributionsList,
} from '../public-profile-contributions'

describe('public profile contributions surfaces', () => {
  it('does not render the contribution graph when public contributions are hidden', () => {
    render(
      <PublicProfileContributionGraph
        githubContributions={{
          totalContributions: 17,
          weeks: [{ days: [{ count: 3, date: '2026-06-01' }] }],
        }}
        show={false}
      />,
    )

    expect(screen.queryByText(/contributions this year/i)).toBeNull()
    expect(
      screen.queryByLabelText(/GitHub contributions in the last year/i),
    ).toBeNull()
  })

  it('renders the contribution graph when public contributions are visible', () => {
    render(
      <PublicProfileContributionGraph
        githubContributions={{
          totalContributions: 17,
          weeks: [{ days: [{ count: 3, date: '2026-06-01' }] }],
        }}
        show
      />,
    )

    expect(screen.getByText('17 contributions this year')).toBeTruthy()
    expect(
      screen.getByLabelText('17 GitHub contributions in the last year'),
    ).toBeTruthy()
  })

  it('renders the empty contribution list state', () => {
    render(<PublicProfileContributionsList contributions={[]} />)

    expect(screen.getByText('no public contributions yet.')).toBeTruthy()
  })
})
