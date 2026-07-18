// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Id } from '../../../../../convex/_generated/dataModel'
import { ProjectReactionBar } from '../project-reaction-bar'

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isLoading: false },
  queryResult: undefined as string[] | undefined,
  useQuery: vi.fn(),
}))

vi.mock('convex/react', () => ({
  useConvexAuth: () => mocks.auth,
  useQuery: (...args: unknown[]) => {
    mocks.useQuery(...args)
    return mocks.queryResult
  },
}))

vi.mock('../../../../../convex/_generated/api', () => ({
  api: { projects: { getViewerReactionTypes: 'getViewerReactionTypes' } },
}))

vi.mock('../reaction-bar', () => ({
  ReactionBar: ({
    disabled,
    targetId,
    viewerReactionTypes,
  }: {
    disabled: boolean
    targetId: string
    viewerReactionTypes: string[]
  }) => (
    <div
      data-testid="reaction-bar"
      data-disabled={String(disabled)}
      data-target-id={targetId}
      data-viewer-reactions={viewerReactionTypes.join(',')}
    />
  ),
}))

const projectId = 'project_1' as Id<'projects'>

describe('ProjectReactionBar', () => {
  beforeEach(() => {
    mocks.auth = { isAuthenticated: true, isLoading: false }
    mocks.queryResult = undefined
    mocks.useQuery.mockReset()
  })

  it('skips the fallback query when enriched viewer state is supplied', () => {
    render(
      <ProjectReactionBar
        projectId={projectId}
        viewerReactionTypes={['rocket']}
      />,
    )

    expect(mocks.useQuery).toHaveBeenCalledWith(
      'getViewerReactionTypes',
      'skip',
    )
    expect(screen.getByTestId('reaction-bar').dataset).toMatchObject({
      disabled: 'false',
      targetId: projectId,
      viewerReactions: 'rocket',
    })
  })

  it('queries only for an authenticated viewer missing enriched state', () => {
    mocks.queryResult = ['like']
    render(<ProjectReactionBar projectId={projectId} />)

    expect(mocks.useQuery).toHaveBeenCalledWith('getViewerReactionTypes', {
      projectId,
    })
    expect(screen.getByTestId('reaction-bar').dataset).toMatchObject({
      disabled: 'false',
      viewerReactions: 'like',
    })
  })

  it('skips and disables while auth is loading or unauthenticated', () => {
    mocks.auth = { isAuthenticated: false, isLoading: true }
    const { rerender } = render(<ProjectReactionBar projectId={projectId} />)

    expect(mocks.useQuery).toHaveBeenLastCalledWith(
      'getViewerReactionTypes',
      'skip',
    )
    expect(screen.getByTestId('reaction-bar').dataset.disabled).toBe('true')

    mocks.auth = { isAuthenticated: false, isLoading: false }
    rerender(<ProjectReactionBar projectId={projectId} />)
    expect(mocks.useQuery).toHaveBeenLastCalledWith(
      'getViewerReactionTypes',
      'skip',
    )
    expect(screen.getByTestId('reaction-bar').dataset.disabled).toBe('true')
  })

  it('merges the legacy liked flag without replacing supplied reactions', () => {
    render(
      <ProjectReactionBar
        liked
        projectId={projectId}
        viewerReactionTypes={['rocket']}
      />,
    )

    expect(
      screen.getByTestId('reaction-bar').dataset.viewerReactions?.split(','),
    ).toEqual(['rocket', 'like'])
  })
})
