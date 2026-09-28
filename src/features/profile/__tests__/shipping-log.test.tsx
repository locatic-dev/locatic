// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { ProfileShippingLogEntry } from '@/features/profile/types'
import { ProfileShippingLog } from '../shipping-log'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    hash,
    params,
    search,
  }: {
    children: ReactNode
    hash?: string
    params: { owner: string; repo: string }
    search?: { post?: string }
  }) => (
    <a
      href={`/project/${params.owner}/${params.repo}${
        search?.post ? `?post=${search.post}` : ''
      }${hash ? `#${hash}` : ''}`}
    >
      {children}
    </a>
  ),
}))

const project = { owner: 'ada', repo: 'maps', fullName: 'ada/maps' }

const entries: ProfileShippingLogEntry[] = [
  {
    kind: 'release',
    id: 'release_old',
    at: Date.UTC(2026, 7, 2, 12),
    project,
    title: 'First light',
    tagName: 'v1.0.0',
    url: 'https://github.com/ada/maps/releases/tag/v1.0.0',
  },
  {
    kind: 'post',
    id: 'post_1',
    at: Date.UTC(2026, 8, 20, 12),
    project,
    excerpt: 'tiles render fast now',
  },
  {
    kind: 'release',
    id: 'release_new',
    at: Date.UTC(2026, 8, 24, 12),
    project,
    title: 'v1.1.0',
    tagName: 'v1.1.0',
    url: 'https://github.com/ada/maps/releases/tag/v1.1.0',
  },
]

describe('ProfileShippingLog', () => {
  it('lists releases and posts newest first with their dates', () => {
    render(<ProfileShippingLog entries={entries} />)

    const section = screen.getByRole('region', { name: 'shipping log' })
    const rows = within(section).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      'Sep 24, 2026released v1.1.0 · ada/maps',
      'Sep 20, 2026posted on ada/mapstiles render fast now',
      'Aug 2, 2026released First light · ada/maps',
    ])
    expect(
      within(rows[0]).getByText('Sep 24, 2026').getAttribute('datetime'),
    ).toBe('2026-09-24T12:00:00.000Z')
  })

  it('links each entry to its project, posts to the post itself', () => {
    render(<ProfileShippingLog entries={entries} />)

    const links = screen.getAllByRole('link', { name: 'ada/maps' })
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/project/ada/maps',
      '/project/ada/maps?post=post_1#post-post_1',
      '/project/ada/maps',
    ])
  })

  it('renders nothing when there are no releases or posts', () => {
    const { container } = render(<ProfileShippingLog entries={[]} />)

    expect(container.innerHTML).toBe('')
    expect(screen.queryByRole('region', { name: 'shipping log' })).toBeNull()
  })
})
