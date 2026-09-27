// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Id } from '../../../../convex/_generated/dataModel'
import type { OnboardingBuilderSuggestion } from '../queries'

vi.mock('@/features/follows/mutations', () => ({
  useFollowUser: () => vi.fn(),
  useUnfollowUser: () => vi.fn(),
}))

import { FollowStepFields } from '../components/follow-step'

function suggestion(
  username: string,
  overrides: Partial<OnboardingBuilderSuggestion> = {},
): OnboardingBuilderSuggestion {
  return {
    userId: `user_${username}` as Id<'users'>,
    displayName: username,
    avatarUrl: null,
    githubUsername: username,
    buildStatus: 'building_solo',
    location: { kind: 'none' },
    projectsCount: 1,
    isNewBuilder: false,
    viewerIsFollowing: false,
    ...overrides,
  }
}

describe('FollowStepFields (D4 order copy)', () => {
  it('explains the order and labels only new builders', () => {
    render(
      <FollowStepFields
        builders={[
          suggestion('ada', { projectsCount: 3 }),
          suggestion('lin', { isNewBuilder: true, projectsCount: 0 }),
        ]}
      />,
    )

    expect(screen.getByText('most recent public work first')).toBeTruthy()
    expect(screen.getByText('3 projects')).toBeTruthy()
    expect(screen.getByText('0 projects · new builder')).toBeTruthy()
    expect(screen.getAllByText(/new builder/)).toHaveLength(1)
  })
})
