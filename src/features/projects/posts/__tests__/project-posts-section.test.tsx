// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { ConvexError } from 'convex/values'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectDetailPayload } from '@/features/contracts'
import { ProjectPostsSection } from '../project-posts-section'

const mocks = vi.hoisted(() => ({
  createPost: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('convex/react', () => ({
  usePaginatedQuery: () => ({
    loadMore: vi.fn(),
    results: [],
    status: 'Exhausted',
  }),
}))

vi.mock('../../../../../convex/_generated/api', () => ({
  api: { posts: { listByProject: 'posts.listByProject' } },
}))

vi.mock('@/features/projects/mutations', () => ({
  useCreatePost: () => mocks.createPost,
}))

vi.mock('../project-post-card', () => ({
  ProjectPostCard: () => null,
}))

describe('ProjectPostsSection composer', () => {
  it('keeps the draft and explains a failed post inline', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.createPost.mockRejectedValueOnce(
      new ConvexError('Too many requests. Try again in 5s.'),
    )

    render(
      <ProjectPostsSection
        detail={
          { project: { _id: 'project_1' } } as unknown as ProjectDetailPayload
        }
        highlightedCommentId={null}
        highlightedCommentPath={[]}
        highlightedPostId={null}
        isOwnProject
        isSignedIn
        projectDetailQueryKey={['project']}
        viewerId="user_1"
      />,
    )

    const composer = screen.getByPlaceholderText(/share what changed/)
    fireEvent.change(composer, { target: { value: 'shipped offline mode' } })
    fireEvent.click(screen.getByRole('button', { name: 'post to repo' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'slow down. try again in 5s.',
    )
    expect((composer as HTMLTextAreaElement).value).toBe('shipped offline mode')
  })
})
