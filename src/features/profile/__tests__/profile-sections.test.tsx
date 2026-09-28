// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { ProfileShowcaseProject } from '@/features/profile/types'
import {
  ProfileContributionSection,
  ProfileLanguagesSection,
  ProfilePinnedSection,
  ProfileRecentWorkSection,
  ProfileSignUpCta,
} from '../profile-sections'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    search,
    to,
  }: {
    children: ReactNode
    search?: unknown
    to: string
  }) => (
    <a data-search={JSON.stringify(search ?? null)} data-to={to} href={to}>
      {children}
    </a>
  ),
  useRouter: () => ({ navigate: vi.fn() }),
}))

vi.mock('@/features/projects/reactions/project-reaction-bar', () => ({
  ProjectReactionBar: () => null,
}))

function project(
  name: string,
  languages: Array<{ name: string; bytes: number }> = [],
) {
  return {
    projectId: `project_${name}`,
    ownerUserId: 'user_ada',
    fullName: `ada/${name}`,
    owner: 'ada',
    repo: name,
    description: null,
    primaryLanguage: languages[0]?.name ?? null,
    languages,
    githubStars: 0,
    locaticLikes: 0,
    reactionCounts: {},
    commentsCount: 0,
    postsCount: 0,
    topics: [],
    lastCommitAt: Date.UTC(2026, 8, 1),
    updatedAt: Date.UTC(2026, 8, 1),
    authorName: 'Ada',
    authorHandle: 'ada',
    authorAvatarUrl: null,
    cityLabel: null,
    cityVisibilityState: 'unset',
  } as unknown as ProfileShowcaseProject
}

describe('profile sections', () => {
  it('renders no pinned block for a visitor when nothing is pinned', () => {
    const { container } = render(<ProfilePinnedSection projects={[]} />)

    expect(container.childElementCount).toBe(0)
  })

  it('shows the owner a pin prompt instead of an empty pinned block', () => {
    render(
      <ProfilePinnedSection
        projects={[]}
        emptyContent={<p>pin up to three projects</p>}
      />,
    )

    expect(screen.getByRole('heading', { name: 'pinned' })).toBeTruthy()
    expect(screen.getByText('pin up to three projects')).toBeTruthy()
  })

  it('renders an owner action on each pinned card', () => {
    render(
      <ProfilePinnedSection
        projects={[project('one'), project('two')]}
        renderProjectAction={(item) => (
          <button type="button">unpin {item.repo}</button>
        )}
      />,
    )

    expect(screen.getByRole('button', { name: 'unpin one' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'unpin two' })).toBeTruthy()
  })

  it('states when there is no recent public work', () => {
    render(
      <ProfileRecentWorkSection posts={[]} projects={[]} reactionsDisabled />,
    )

    expect(screen.getByRole('heading', { name: 'recent work' })).toBeTruthy()
    expect(screen.getByText('no public work yet.')).toBeTruthy()
  })

  it('titles the graph with the yearly total', () => {
    render(
      <ProfileContributionSection
        githubContributions={{
          totalContributions: 1234,
          syncedAt: 0,
          weeks: [{ days: [{ count: 3, date: '2026-06-01' }] }],
        }}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'github contributions' }),
    ).toBeTruthy()
    expect(screen.getByText('1,234 contributions this year')).toBeTruthy()
    expect(
      screen.getByLabelText('1234 GitHub contributions in the last year'),
    ).toBeTruthy()
  })

  it('summarises languages across shown projects and hides when there are none', () => {
    const { rerender } = render(
      <ProfileLanguagesSection
        projects={[
          project('one', [
            { name: 'Rust', bytes: 300 },
            { name: 'TypeScript', bytes: 100 },
          ]),
          project('two', [{ name: 'TypeScript', bytes: 100 }]),
        ]}
      />,
    )

    expect(screen.getByRole('heading', { name: 'languages' })).toBeTruthy()
    expect(screen.getByText('Rust')).toBeTruthy()
    expect(screen.getByText('TypeScript')).toBeTruthy()

    rerender(<ProfileLanguagesSection projects={[project('three')]} />)
    expect(screen.queryByRole('heading', { name: 'languages' })).toBeNull()
  })

  it('sends visitors to sign-up with the destination preserved', () => {
    render(<ProfileSignUpCta displayName="Ada" redirect="/u/ada" />)

    const link = screen.getByRole('link', { name: 'sign up to follow' })
    expect(link.getAttribute('data-to')).toBe('/sign-up/$')
    expect(JSON.parse(link.getAttribute('data-search') ?? 'null')).toEqual({
      redirect: '/u/ada',
    })
  })
})
