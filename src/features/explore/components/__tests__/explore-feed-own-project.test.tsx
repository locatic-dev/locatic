// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Id } from '../../../../../convex/_generated/dataModel'

import type { ProjectCardPreview } from '@/features/contracts'
import type { ExploreFeedState } from '../../feed-state'
import { ExploreFeed } from '../explore-feed'

// Lists which personal actions the card was given.
vi.mock('@/components/ui/project-card', () => ({
  ProjectCard: ({
    onDismiss,
    onDM,
    onFollow,
    onToggleSave,
    project,
  }: {
    onDismiss?: () => void
    onDM?: () => void
    onFollow?: () => void
    onToggleSave?: () => void
    project: { fullName: string }
  }) => (
    <article aria-label={project.fullName}>
      {[
        onFollow && 'follow',
        onDismiss && 'hide',
        onToggleSave && 'save',
        onDM && 'message',
      ]
        .filter(Boolean)
        .join(',') || 'no actions'}
    </article>
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

const viewerId = 'user_viewer' as Id<'users'>

const projectBy = (ownerUserId: string, fullName: string) =>
  ({
    projectId: `project_${fullName}` as Id<'projects'>,
    ownerUserId: ownerUserId as Id<'users'>,
    fullName,
    owner: fullName.split('/')[0]!,
    repo: fullName.split('/')[1]!,
    description: '',
    primaryLanguage: null,
    languages: [],
    githubStars: 0,
    locaticLikes: 0,
    commentsCount: 0,
    postsCount: 0,
    topics: [],
    lastCommitAt: 0,
    updatedAt: 0,
    authorName: 'Someone',
    authorHandle: fullName.split('/')[0]!,
    authorAvatarUrl: null,
    cityLabel: null,
    cityVisibilityState: 'unset',
  }) as unknown as ProjectCardPreview

function renderSearch(items: Array<ProjectCardPreview>) {
  const state = {
    mode: 'projects',
    source: 'search',
    query: 'engine',
    status: 'ready',
    items,
    more: 'none',
  } as unknown as ExploreFeedState

  render(
    <ExploreFeed
      entranceKey="search"
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
      state={state}
      viewerId={viewerId}
    />,
  )
}

describe('ExploreFeed own projects in search results', () => {
  it('offers no follow, hide, save or message on the viewer’s own project and labels it', () => {
    // Search rows do not set `isViewerProject`.
    renderSearch([
      projectBy(viewerId, 'me/engine'),
      projectBy('user_ada', 'ada/engine'),
    ])

    expect(screen.getByRole('article', { name: 'me/engine' }).textContent).toBe(
      'no actions',
    )
    expect(screen.getByText('yours')).toBeTruthy()
    expect(
      screen.getByRole('article', { name: 'ada/engine' }).textContent,
    ).toBe('follow,hide,save,message')
  })
})
