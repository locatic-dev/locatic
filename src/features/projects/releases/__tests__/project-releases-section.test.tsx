// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Id } from '../../../../../convex/_generated/dataModel'
import type { ProjectDetailPayload } from '@/features/contracts'
import { ProjectReleasesSection } from '../project-releases-section'

type ProjectRelease = ProjectDetailPayload['releases'][number]

function releaseFixture(
  overrides: Partial<ProjectRelease> = {},
): ProjectRelease {
  return {
    _id: 'release_1' as Id<'project_releases'>,
    _creationTime: 1,
    projectId: 'project_1' as Id<'projects'>,
    githubReleaseId: 100,
    tagName: 'v1.0.0',
    name: 'Launch build',
    body: 'Ships the first release.',
    htmlUrl: 'https://github.com/locatic/app/releases/tag/v1.0.0',
    isDraft: false,
    isPrerelease: false,
    publishedAt: Date.now(),
    createdAt: 1,
    updatedAt: 1,
    importedAt: 1,
    ...overrides,
  }
}

describe('ProjectReleasesSection', () => {
  it('renders release rows as full external GitHub links', () => {
    render(<ProjectReleasesSection releases={[releaseFixture()]} />)

    const link = screen.getByRole('link', {
      name: 'Open Launch build release on GitHub',
    })
    expect(link.getAttribute('href')).toBe(
      'https://github.com/locatic/app/releases/tag/v1.0.0',
    )
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getByText('view on GitHub')).toBeTruthy()
  })

  it('uses compact markdown previews without images, tables, or form controls', () => {
    const { container } = render(
      <ProjectReleasesSection
        releases={[
          releaseFixture({
            body: [
              '## Highlights',
              '',
              '![demo](https://example.com/demo.png)',
              '',
              '| A | B |',
              '| - | - |',
              '| 1 | 2 |',
              '',
              '- [ ] not a task input',
              '',
              '[docs](https://example.com)',
            ].join('\n'),
          }),
        ]}
      />,
    )

    expect(screen.getByText('Highlights')).toBeTruthy()
    expect(screen.getByText('docs')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('table')).toBeNull()
    expect(container.querySelector('input')).toBeNull()
  })

  it('renders a quiet empty state', () => {
    render(<ProjectReleasesSection releases={[]} />)

    expect(screen.getByText('no GitHub releases imported yet.')).toBeTruthy()
  })
})
