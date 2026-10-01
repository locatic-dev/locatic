// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PublicProfileContributionsList } from '../public-profile-contributions'

describe('public profile contributions list', () => {
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
