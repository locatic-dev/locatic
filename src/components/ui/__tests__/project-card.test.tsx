// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ProjectCard, type ProjectCardData } from '../project-card'

const navigate = vi.fn()
const preloadRoute = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    ...props
  }: PropsWithChildren<Record<string, unknown>>) => (
    <a href="#" {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({
    navigate,
    preloadRoute,
  }),
}))

const project = {
  id: 'project_1',
  owner: 'locatic',
  repo: 'app',
  description: 'Developer activity platform',
  lang: 'TypeScript',
  githubStars: 12,
  locaticLikes: 4,
  commentsCount: 2,
  authorName: 'Avi',
  authorHandle: 'avinash',
} satisfies ProjectCardData

describe('ProjectCard', () => {
  it('keeps dismiss and comment controls as 44px touch targets', () => {
    render(
      <ProjectCard project={project} onDismiss={vi.fn()} onComment={vi.fn()} />,
    )

    expect(
      screen.getByRole('button', { name: /dismiss/i }).className,
    ).toContain('min-h-11')
    expect(
      screen.getByRole('button', { name: /dismiss/i }).className,
    ).toContain('min-w-11')
    expect(
      screen.getByRole('button', { name: /comments/i }).className,
    ).toContain('min-h-11')
    expect(
      screen.getByRole('button', { name: /comments/i }).className,
    ).toContain('min-w-11')
  })

  it('does not use nested action clicks for root-card navigation', () => {
    const onDismiss = vi.fn()
    const onComment = vi.fn()

    render(
      <ProjectCard
        project={project}
        projectLink={{ owner: 'locatic', repo: 'app' }}
        onDismiss={onDismiss}
        onComment={onComment}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    fireEvent.click(screen.getByRole('button', { name: /comments/i }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onComment).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('does not render a recommendation badge from legacy card data', () => {
    render(
      <ProjectCard
        project={
          {
            ...project,
            isRecommended: true,
            matchPct: 97,
          } as ProjectCardData
        }
      />,
    )

    expect(screen.queryByText('recommended')).toBeNull()
    expect(screen.queryByText('97% match')).toBeNull()
  })
})
