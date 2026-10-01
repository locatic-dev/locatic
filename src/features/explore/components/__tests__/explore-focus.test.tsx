// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PropsWithChildren } from 'react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Id } from '../../../../../convex/_generated/dataModel'

import type { ProjectCardPreview } from '@/features/contracts'
import { describeExploreResults, type ExploreFeedState } from '../../feed-state'
import type { ExploreFilters } from '../../state'
import { ExploreFeed } from '../explore-feed'
import { ExploreFilterBar } from '../explore-filters'

vi.mock('@/components/ui/project-card', () => ({
  ProjectCard: ({ project }: { project: { fullName: string } }) => (
    <article>{project.fullName}</article>
  ),
}))

vi.mock('@/features/projects/saves', () => ({
  useProjectSaveToggle: () => ({ toggle: vi.fn(), isPending: () => false }),
}))

vi.mock('../../use-explore-saves', () => ({
  useExploreSavedProjectIds: () => new Set<string>(),
}))

vi.mock('@/features/projects/reactions/project-reaction-bar', () => ({
  ProjectReactionBar: () => null,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: PropsWithChildren) => <a href="/">{children}</a>,
}))

vi.mock('motion/react-m', () => ({
  div: ({ children }: PropsWithChildren) => <div>{children}</div>,
}))

vi.mock('@/integrations/convex/metrics', () => ({
  useEmptyStateActionMetric: () => (action: () => void) => action,
}))

const project = (name: string) =>
  ({
    projectId: `project_${name}` as Id<'projects'>,
    ownerUserId: 'user_ada' as Id<'users'>,
    fullName: `ada/${name}`,
    owner: 'ada',
    repo: name,
    authorHandle: 'ada',
  }) as unknown as ProjectCardPreview

const ready = (count: number) =>
  ({
    mode: 'projects',
    source: 'browse',
    scope: 'cities',
    status: 'ready',
    items: Array.from({ length: count }, (_, index) => project(`p${index}`)),
    more: 'none',
  }) as unknown as ExploreFeedState

const exhausted = {
  mode: 'projects',
  source: 'browse',
  scope: 'cities',
  status: 'exhausted',
} as ExploreFeedState

/** Explore's feed with URL filters the empty-state action clears. */
function FilteredFeed() {
  const [filtered, setFiltered] = useState(true)
  return (
    <ExploreFeed
      activeFilters={
        filtered
          ? {
              description: 'primary language rust',
              onClear: () => setFiltered(false),
            }
          : undefined
      }
      entranceKey="k"
      followOverrides={{}}
      followedUserIds={new Set()}
      likedProjectIds={new Set()}
      onDismissPost={vi.fn()}
      onDismissProject={vi.fn()}
      onFollowUser={vi.fn()}
      onLoadMore={vi.fn()}
      onMessageUser={vi.fn()}
      onOpenBuilderProfile={vi.fn()}
      pendingFollows={new Set()}
      pendingUserId={null}
      state={filtered ? exhausted : ready(2)}
    />
  )
}

describe('Explore result announcements', () => {
  it('counts results and says when nothing matches', () => {
    expect(describeExploreResults(ready(1), { filtered: false })).toBe(
      '1 project',
    )
    expect(describeExploreResults(ready(12), { filtered: false })).toBe(
      '12 projects',
    )
    expect(describeExploreResults(exhausted, { filtered: false })).toBe(
      'no projects match',
    )
    expect(describeExploreResults(exhausted, { filtered: true })).toBe(
      'no projects match these filters',
    )
    expect(
      describeExploreResults({ ...exhausted, status: 'loading' } as never, {
        filtered: false,
      }),
    ).toBe('')
  })

  it('moves focus to the results and announces them when "clear filters" unmounts itself', async () => {
    const user = userEvent.setup()
    render(<FilteredFeed />)
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('no projects match these filters')

    await user.click(screen.getByRole('button', { name: 'clear filters' }))

    expect(screen.queryByRole('button', { name: 'clear filters' })).toBeNull()
    expect(document.activeElement).toBe(
      screen.getByRole('region', { name: 'projects results' }),
    )
    expect(status.textContent).toBe('2 projects')
  })
})

describe('Explore filter chips', () => {
  function Bar() {
    const [filters, setFilters] = useState<ExploreFilters>({
      language: 'rust',
    })
    return (
      <ExploreFilterBar
        filters={filters}
        mode="projects"
        onFiltersChange={(next) => setFilters({ ...filters, ...next })}
      />
    )
  }

  it('moves focus to the filter button when a chip is removed', async () => {
    const user = userEvent.setup()
    render(<Bar />)

    await user.click(
      screen.getByRole('button', {
        name: 'Remove primary language filter rust',
      }),
    )

    expect(
      screen.queryByRole('button', { name: /Remove primary language/ }),
    ).toBeNull()
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'filter' }),
    )
  })
})
