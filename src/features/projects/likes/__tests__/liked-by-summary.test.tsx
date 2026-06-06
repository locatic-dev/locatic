// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Id } from '../../../../../convex/_generated/dataModel'
import { LikedBySummary, type LikedByUser } from '../liked-by-summary'

let paginatedState: {
  results: LikedByUser[]
  status: string
  loadMore: ReturnType<typeof vi.fn>
}

vi.mock('convex/react', () => ({
  usePaginatedQuery: () => paginatedState,
}))

vi.mock('../../../../../convex/_generated/api', () => ({
  api: { projects: { listLikers: 'projects.listLikers' } },
}))

function makeUser(id: string, displayName: string): LikedByUser {
  return {
    userId: id as Id<'users'>,
    githubUsername: id,
    displayName,
    avatarUrl: null,
  }
}

beforeEach(() => {
  paginatedState = {
    results: [],
    status: 'LoadingFirstPage',
    loadMore: vi.fn(),
  }
})

describe('LikedBySummary', () => {
  it('renders nothing when there are no likes', () => {
    const { container } = render(
      <LikedBySummary
        projectId={'project_1' as Id<'projects'>}
        likedByPreview={[]}
        likesCount={0}
        onOpenProfile={vi.fn()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders an interactive profile target when one liker fits the preview', () => {
    const onOpenProfile = vi.fn()
    render(
      <LikedBySummary
        projectId={'project_1' as Id<'projects'>}
        likedByPreview={[makeUser('saketha', 'Saketha Rama')]}
        likesCount={1}
        onOpenProfile={onOpenProfile}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: /open saketha rama's profile/i,
      }),
    )

    expect(onOpenProfile).toHaveBeenCalledWith('saketha')
  })

  it('renders separate profile targets when two likers fit the preview', () => {
    const onOpenProfile = vi.fn()
    render(
      <LikedBySummary
        projectId={'project_1' as Id<'projects'>}
        likedByPreview={[
          makeUser('saketha', 'Saketha Rama'),
          makeUser('avinash', 'Avinash C'),
        ]}
        likesCount={2}
        onOpenProfile={onOpenProfile}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: /open avinash c's profile/i,
      }),
    )

    expect(onOpenProfile).toHaveBeenCalledWith('avinash')
  })

  it('summarizes overflow and opens a dialog listing all likers', () => {
    const onOpenProfile = vi.fn()
    render(
      <LikedBySummary
        projectId={'project_1' as Id<'projects'>}
        likedByPreview={[
          makeUser('saketha', 'Saketha Rama'),
          makeUser('avinash', 'Avinash C'),
          makeUser('mira', 'Mira B'),
        ]}
        likesCount={12}
        onOpenProfile={onOpenProfile}
      />,
    )

    expect(screen.getByText(/and 10 others/)).toBeTruthy()

    // Dialog data becomes available once opened.
    paginatedState = {
      results: [
        makeUser('saketha', 'Saketha Rama'),
        makeUser('avinash', 'Avinash C'),
      ],
      status: 'Exhausted',
      loadMore: vi.fn(),
    }

    fireEvent.click(
      screen.getByRole('button', {
        name: /view all 12 people who liked this project/i,
      }),
    )

    fireEvent.click(screen.getByText('@avinash'))
    expect(onOpenProfile).toHaveBeenCalledWith('avinash')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
