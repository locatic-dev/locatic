// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReactionBar } from '../reaction-bar'

// Unlike reaction-bar.test.tsx, this file renders the real ReactorInspector
// and popover so the pill structure matches what ships.
vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

vi.mock('convex/react', () => ({
  useQuery: () => [
    { key: 'like', label: 'Like', emoji: '❤️', color: '#f2555f' },
    { key: 'rocket', label: 'Rocket', emoji: '🚀', color: '#a78bfa' },
  ],
  usePaginatedQuery: () => ({
    loadMore: vi.fn(),
    results: [],
    status: 'Exhausted',
  }),
}))

vi.mock('../../../../../convex/_generated/api', () => ({
  api: {
    reactions: {
      listConfig: 'reactions.listConfig',
      listReactors: 'reactions.listReactors',
    },
  },
}))

vi.mock('@/features/projects/mutations', () => ({
  useReactToTarget: () => vi.fn(),
  useUnreactFromTarget: () => vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))

describe('ReactionBar pills', () => {
  it('names each part of a counted pill', () => {
    render(
      <ReactionBar
        disabled={false}
        reactionCounts={{ like: 2 }}
        targetId="post_1"
        targetType="post"
        viewerReactionTypes={[]}
      />,
    )

    const add = screen.getByRole('button', { name: 'Add Like reaction' })
    const pill = add.closest('[data-reaction-pill]')
    expect(pill).not.toBeNull()
    expect(
      within(pill as HTMLElement).getByRole('button', {
        name: 'View 2 Like reactions',
      }),
    ).toBeTruthy()
    expect(within(pill as HTMLElement).getAllByRole('button')).toHaveLength(2)
  })

  it('renders a zero-count project like as a single-button pill', () => {
    render(
      <ReactionBar
        disabled={false}
        reactionCounts={{}}
        targetId="project_1"
        targetType="project"
        viewerReactionTypes={[]}
      />,
    )

    const like = screen.getByRole('button', { name: 'Add Like reaction' })
    expect(like.hasAttribute('data-reaction-pill')).toBe(true)
    expect(
      screen
        .getByRole('button', { name: 'Add project reaction' })
        .closest('[data-reaction-pill]'),
    ).toBeNull()
  })

  it('fades only the action when reacting is unavailable, never the count', () => {
    render(
      <ReactionBar
        disabled
        reactionCounts={{ like: 2 }}
        targetId="project_1"
        targetType="project"
        viewerReactionTypes={['rocket']}
      />,
    )

    const add = screen.getByRole('button', { name: 'Add Like reaction' })
    const count = screen.getByRole('button', { name: 'View 2 Like reactions' })
    expect(add).toHaveProperty('disabled', true)
    expect(add.className).toContain('opacity-60')
    // The count stays enabled (it opens the reactor list) at full contrast:
    // neither it nor any ancestor carries the fade.
    expect(count).toHaveProperty('disabled', false)
    expect(count.closest('.opacity-60')).toBeNull()

    // A zero-count pill is only the action, so all of it fades.
    const rocket = screen.getByRole('button', {
      name: 'Remove Rocket reaction',
    })
    expect(rocket.hasAttribute('data-reaction-pill')).toBe(true)
    expect(rocket.className).toContain('opacity-60')
  })
})
