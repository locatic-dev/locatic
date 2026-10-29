// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ConvexError } from 'convex/values'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectDetailPayload } from '@/features/contracts'
import { ProjectPostsSection } from '../project-posts-section'

const mocks = vi.hoisted(() => ({
  createPost: vi.fn(),
  posts: [] as Array<{ _id: string }>,
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('convex/react', () => ({
  usePaginatedQuery: () => ({
    loadMore: vi.fn(),
    results: mocks.posts,
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

afterEach(() => {
  cleanup()
  mocks.posts = []
  vi.unstubAllGlobals()
})

it('lets the comment own scrolling and does not recenter its post on release', () => {
  const scroll = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scroll,
  })
  mocks.posts = [{ _id: 'post_1' }]
  const page = (comment: string | null) => (
    <ProjectPostsSection
      detail={
        { project: { _id: 'project_1' } } as unknown as ProjectDetailPayload
      }
      highlightedCommentId={comment}
      highlightedCommentPath={[]}
      highlightedPostId="post_1"
      isOwnProject={false}
      isSignedIn={false}
      projectDetailQueryKey={['project']}
      viewerId={null}
    />
  )
  const { rerender } = render(page('comment_1'))
  expect(scroll).not.toHaveBeenCalled()
  rerender(page(null))
  expect(scroll).not.toHaveBeenCalled()
})

it('still scrolls a bare post destination once and respects reduced motion', () => {
  const scroll = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scroll,
  })
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  mocks.posts = [{ _id: 'post_1' }]
  const page = () => (
    <ProjectPostsSection
      detail={
        { project: { _id: 'project_1' } } as unknown as ProjectDetailPayload
      }
      highlightedCommentId={null}
      highlightedCommentPath={[]}
      highlightedPostId="post_1"
      isOwnProject={false}
      isSignedIn={false}
      projectDetailQueryKey={['project']}
      viewerId={null}
    />
  )
  const { rerender } = render(page())
  expect(scroll).toHaveBeenCalledExactlyOnceWith({
    behavior: 'instant',
    block: 'center',
  })
  mocks.posts = [...mocks.posts, { _id: 'post_2' }]
  rerender(page())
  expect(scroll).toHaveBeenCalledOnce()
})

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
