// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NotificationRecord } from '@/features/contracts'

type QueryOptions = { queryKey: [string, string, unknown] }
type LiveStatus =
  | 'LoadingFirstPage'
  | 'CanLoadMore'
  | 'LoadingMore'
  | 'Exhausted'

const mocks = vi.hoisted(() => ({
  live: {
    results: [] as unknown[],
    status: 'Exhausted' as string,
  },
  loadMore: vi.fn(),
  markAllRead: vi.fn(),
  markRead: vi.fn(),
  navigate: vi.fn(),
  ssrPage: [] as unknown[],
  unreadCount: 0,
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute:
    () =>
    <TOptions,>(options: TOptions) => ({
      options,
      useNavigate: () => mocks.navigate,
    }),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ prefetchQuery: vi.fn() }),
  useSuspenseQuery: ({ queryKey: [, functionName] }: QueryOptions) => {
    if (functionName !== 'notifications:list') {
      throw new Error(`unexpected suspense query ${functionName}`)
    }
    return {
      data: { page: mocks.ssrPage, isDone: false, continueCursor: 'c1' },
    }
  },
  useQuery: ({ queryKey: [, functionName] }: QueryOptions) => {
    if (functionName !== 'notifications:unreadCount') {
      throw new Error(`unexpected query ${functionName}`)
    }
    return { data: mocks.unreadCount }
  },
}))

vi.mock('convex/react', () => ({
  usePaginatedQuery: () => ({ ...mocks.live, loadMore: mocks.loadMore }),
}))

vi.mock('@/features/notifications/mutations', () => ({
  useMarkAllNotificationsRead: () => mocks.markAllRead,
  useMarkNotificationRead: () => mocks.markRead,
}))

function notification(
  id: string,
  actor: string,
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord {
  return {
    _id: id,
    _creationTime: 1,
    recipientId: 'user_viewer',
    actorId: `user_${actor}`,
    type: 'followed',
    projectId: null,
    postId: null,
    commentId: null,
    actorSnapshot: { displayName: actor, avatarUrl: '' },
    projectName: null,
    target: {
      kind: 'profile',
      username: actor,
      projectFullName: null,
      conversationId: null,
      inboxTab: null,
      commentId: null,
    },
    isRead: false,
    createdAt: 1,
    ...overrides,
  } as unknown as NotificationRecord
}

function setLive(results: unknown[], status: LiveStatus) {
  mocks.live = { results, status }
}

async function renderNotifications() {
  const { Route } = await import('@/routes/_app/notifications')
  const NotificationsPage = Route.options.component as () => ReactNode
  const view = render(<NotificationsPage />)
  return { rerender: () => view.rerender(<NotificationsPage />) }
}

describe('notifications route', () => {
  beforeEach(() => {
    mocks.ssrPage = []
    mocks.unreadCount = 0
    setLive([], 'Exhausted')
    mocks.markRead.mockResolvedValue(null)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('runs no mutation when the list is viewed', async () => {
    setLive(
      [
        notification('n1', 'ana'),
        // A legacy row with no stored target: rendering must not backfill it.
        notification('n2', 'bo', { target: undefined }),
      ],
      'Exhausted',
    )
    mocks.unreadCount = 2

    await renderNotifications()

    expect(mocks.markRead).not.toHaveBeenCalled()
    expect(mocks.markAllRead).not.toHaveBeenCalled()
  })

  it('names unread rows as unread and read rows without it', async () => {
    setLive(
      [
        notification('n1', 'ana', {
          type: 'post_commented',
          projectName: 'locatic',
        }),
        notification('n2', 'bo', { isRead: true }),
      ],
      'Exhausted',
    )

    await renderNotifications()

    expect(
      screen.getByRole('button', {
        name: /^unread: ana commented on your post on "locatic"/,
      }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /^bo started following you/ }),
    ).toBeTruthy()
  })

  it('shows the server unread count, not a count of the loaded rows', async () => {
    setLive([notification('n1', 'ana')], 'CanLoadMore')
    mocks.unreadCount = 7

    await renderNotifications()

    expect(screen.getByText('7 unread')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'mark all read' })).toBeTruthy()
  })

  it('marks a row read on click and opens its destination', async () => {
    setLive([notification('n1', 'ana')], 'Exhausted')

    await renderNotifications()
    await act(async () => {
      screen.getByRole('button', { name: /^unread: ana/ }).click()
    })

    expect(mocks.markRead).toHaveBeenCalledWith({ notificationId: 'n1' })
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/u/$username',
      params: { username: 'ana' },
      search: { tab: 'projects' },
    })
    expect(
      screen.getByRole('button', { name: /^ana started following you/ }),
    ).toBeTruthy()
  })

  it('marks only rows created up to the server cutoff read locally', async () => {
    setLive(
      [
        notification('n2', 'bo', { createdAt: 20 }),
        notification('n1', 'ana', { createdAt: 10 }),
      ],
      'Exhausted',
    )
    mocks.unreadCount = 2
    mocks.markAllRead.mockResolvedValue({ cutoff: 15, isDone: false })

    await renderNotifications()
    await act(async () => {
      screen.getByRole('button', { name: 'mark all read' }).click()
    })

    expect(mocks.markAllRead).toHaveBeenCalledWith({})
    expect(
      screen.getByRole('button', { name: /^ana started following you/ }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /^unread: bo started following you/ }),
    ).toBeTruthy()
  })

  it('keeps loaded pages when a new notification arrives live', async () => {
    setLive(
      [notification('n1', 'ana'), notification('n2', 'bo')],
      'CanLoadMore',
    )
    const { rerender } = await renderNotifications()
    screen.getByRole('button', { name: 'load more' }).click()
    expect(mocks.loadMore).toHaveBeenCalledWith(20)

    setLive(
      [
        notification('n1', 'ana'),
        notification('n2', 'bo'),
        notification('n3', 'cy'),
      ],
      'Exhausted',
    )
    rerender()
    setLive(
      [
        notification('n0', 'dee'),
        notification('n1', 'ana'),
        notification('n2', 'bo'),
        notification('n3', 'cy'),
      ],
      'Exhausted',
    )
    rerender()

    for (const actor of ['dee', 'ana', 'bo', 'cy']) {
      expect(
        screen.getByRole('button', { name: new RegExp(`^unread: ${actor}`) }),
      ).toBeTruthy()
    }
    expect(screen.queryByRole('button', { name: 'load more' })).toBeNull()
  })

  it('shows row skeletons while more rows load', async () => {
    setLive([notification('n1', 'ana')], 'LoadingMore')

    await renderNotifications()

    expect(
      screen.getByRole('status', { name: 'loading more notifications' }),
    ).toBeTruthy()
  })

  it('renders the SSR first page until the live list arrives', async () => {
    mocks.ssrPage = [notification('n1', 'ana')]
    setLive([], 'LoadingFirstPage')

    await renderNotifications()

    expect(screen.getByRole('button', { name: /^unread: ana/ })).toBeTruthy()
    expect(screen.queryByText('no notifications yet')).toBeNull()
  })
})
