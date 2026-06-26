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

  it('renders exactly one like affordance (no duplicate heart)', () => {
    render(<ProjectCard project={project} onLike={vi.fn()} />)

    expect(
      screen.getAllByRole('button', { name: /^(like|unlike)$/i }),
    ).toHaveLength(1)
  })

  it('marks the like control as red when liked, not brand teal', () => {
    render(
      <ProjectCard project={{ ...project, liked: true }} onLike={vi.fn()} />,
    )

    const like = screen.getByRole('button', { name: /unlike/i })
    expect(like.className).toContain('text-liked')
    expect(like.className).not.toContain('text-brand')
  })

  it('keeps the language signature in content instead of a side rail', () => {
    const { container } = render(<ProjectCard project={project} />)

    expect(screen.getByText('TypeScript')).toBeTruthy()
    expect(container.innerHTML).not.toContain('w-[3px]')
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
