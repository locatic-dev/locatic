// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  data: null as unknown,
  params: { owner: 'ada', repo: 'engine' },
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute:
    () =>
    <TOptions,>(options: TOptions) => ({
      options,
      useParams: () => mocks.params,
    }),
  Link: () => null,
  notFound: () => ({ isNotFound: true }),
  redirect: vi.fn(),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined }),
  useSuspenseQuery: () => ({ data: mocks.data }),
}))

// A stand-in view with local state (like a comment draft) that records the
// project it was first mounted for.
vi.mock('@/features/projects/project-view', () => ({
  ProjectView: ({ detail }: { detail: { project: { _id: string } } }) => {
    const [mountedFor] = useState(detail.project._id)
    return <p>draft owned by {mountedFor}</p>
  },
}))

const { Route } = await import('../_app/project.$owner.$repo')
const Page = Route.options.component as ComponentType

const payloadFor = (projectId: string) => ({
  canonicalRoute: null,
  comments: [],
  owner: {},
  project: { _id: projectId },
  releases: [],
  viewerFollowsOwner: false,
  viewerHasLiked: false,
  reactionCounts: {},
  viewerReactionTypes: [],
})

describe('project route', () => {
  it('mounts a fresh project view when navigating to another project', () => {
    mocks.data = payloadFor('project_engine')
    const { rerender } = render(<Page />)
    expect(screen.getByText('draft owned by project_engine')).toBeTruthy()

    // "more from {city}" reuses the route component for the next project.
    mocks.params = { owner: 'bob', repo: 'kiln' }
    mocks.data = payloadFor('project_kiln')
    rerender(<Page />)

    expect(screen.getByText('draft owned by project_kiln')).toBeTruthy()
    expect(screen.queryByText('draft owned by project_engine')).toBeNull()
  })
})
