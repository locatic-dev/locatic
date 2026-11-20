// @vitest-environment jsdom
import { act } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Id } from '../../../../../convex/_generated/dataModel'
import type { ExplorePostPreview } from '../../types'
import { HYDRATED_NOW_TICK_MS } from '@/lib/use-hydrated-now'
import { ExplorePostCard } from '../explore-post-card'

// Keep the real card and clock; replace routing and the reaction backend only.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params = {},
    search,
    to,
    hash,
    preload: _preload,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode
    params?: Record<string, string>
    search?: unknown
    to: string
    hash?: string
    preload?: string
  }) => (
    <a
      href={`${to.replace(/\$(\w+)/g, (_match, key: string) => params[key] ?? '')}${hash ? `#${hash}` : ''}`}
      data-search={search ? JSON.stringify(search) : undefined}
      {...props}
    >
      {children}
    </a>
  ),
}))

vi.mock('@/features/projects/reactions/reaction-bar', () => ({
  ReactionBar: () => null,
}))

const CREATED_AT = Date.UTC(2026, 8, 30, 12)
const post: ExplorePostPreview = {
  _id: 'post_1' as Id<'posts'>,
  _creationTime: CREATED_AT,
  projectId: 'project_1' as Id<'projects'>,
  ownerId: 'user_1' as Id<'users'>,
  actorId: 'user_1' as Id<'users'>,
  authorRole: 'owner',
  body: 'Shipped offline maps',
  reactionCounts: {},
  commentsCount: 0,
  projectCityId: null,
  projectTopics: [],
  actorSnapshot: {
    displayName: 'Alice',
    avatarUrl: '',
    cityId: null,
    cityName: null,
  },
  projectSnapshot: {
    name: 'city-notes',
    fullName: 'alice/city-notes',
    ownerLogin: 'alice',
    primaryLanguage: 'TypeScript',
    languages: [],
  },
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
}

describe('ExplorePostCard timestamps', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    [59_500, 250, 'just now'],
    [59_500, 1_000, '1m ago'],
    [3_599_500, 1_000, '1h ago'],
  ])(
    'hydrates at age %ims after a %ims delay without replacing server content',
    async (serverAge, delay, label) => {
      vi.setSystemTime(CREATED_AT + serverAge)
      const card = (
        <ExplorePostCard post={post} visitor={{ signInRedirect: '/explore' }} />
      )
      const container = document.createElement('div')
      container.innerHTML = renderToString(card)
      document.body.append(container)
      const body = container.querySelector('p')
      const recoverable = vi.fn()
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      vi.setSystemTime(CREATED_AT + serverAge + delay)
      const root = await act(async () =>
        hydrateRoot(container, card, { onRecoverableError: recoverable }),
      )
      try {
        expect(container.textContent).toContain(label)
        expect(recoverable).not.toHaveBeenCalled()
        expect(consoleError).not.toHaveBeenCalled()
        expect(container.querySelector('p')).toBe(body)
        expect(container.querySelector('a')?.getAttribute('href')).toBe(
          '/project/alice/city-notes#post-post_1',
        )
      } finally {
        act(() => root.unmount())
        container.remove()
      }
    },
  )

  it('renders a semantic UTC date on the server and ages on the shared clock after hydration', async () => {
    vi.setSystemTime(CREATED_AT + 59_500)
    const card = <ExplorePostCard post={post} />
    const container = document.createElement('div')
    container.innerHTML = renderToString(card)
    const time = container.querySelector('time')
    expect(time?.textContent).toBe('Sep 30, 2026')
    expect(time?.getAttribute('datetime')).toBe('2026-09-30T12:00:00.000Z')

    const root = await act(async () => hydrateRoot(container, card))
    try {
      expect(time?.textContent).toBe('just now')
      act(() => vi.advanceTimersByTime(HYDRATED_NOW_TICK_MS))
      expect(time?.textContent).toBe('1m ago')
      expect(time?.getAttribute('datetime')).toBe('2026-09-30T12:00:00.000Z')
    } finally {
      act(() => root.unmount())
    }
  })
})
