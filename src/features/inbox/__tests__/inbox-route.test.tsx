// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ViewerBootstrapPayload } from '@/features/contracts'
import type { InboxConversation } from '../navigation'

type QueryOptions = { queryKey: [string, string, unknown] }
type InboxSearch = {
  tab: 'inbox' | 'requests'
  conversation: string | null
  compose: string | null
}

const mocks = vi.hoisted(() => ({
  conversations: [] as unknown[],
  markRead: vi.fn(),
  navigate: vi.fn(),
  search: { tab: 'inbox', conversation: null, compose: null } as {
    tab: 'inbox' | 'requests'
    conversation: string | null
    compose: string | null
  },
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute:
    () =>
    <TOptions,>(options: TOptions) => ({
      options,
      useNavigate: () => mocks.navigate,
      useSearch: () => mocks.search,
    }),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useSuspenseQuery: ({ queryKey: [, functionName] }: QueryOptions) => {
    switch (functionName) {
      case 'users:viewerBootstrap':
        return { data: bootstrap }
      case 'conversations:list':
        return { data: mocks.conversations }
      default:
        throw new Error(`unexpected suspense query ${functionName}`)
    }
  },
  useQuery: () => ({ data: undefined, isLoading: false }),
}))

vi.mock('convex/react', () => ({
  usePaginatedQuery: () => ({
    results: [],
    status: 'Exhausted',
    loadMore: vi.fn(),
  }),
}))

vi.mock('@/features/inbox/mutations', () => ({
  useMarkConversationRead: () => mocks.markRead,
  useSendFirstMessage: () => vi.fn(),
  useSendMessage: () => vi.fn(),
}))

const VIEWER = 'user_viewer'

const bootstrap = {
  isAuthenticated: true,
  needsOnboarding: false,
  status: 'ready',
  viewer: {
    _id: VIEWER,
    appearInExplore: true,
    exploreConfig: { cityIds: [], stackPrefs: [] },
    github: { username: 'viewer' },
    notificationPrefs: {},
    onboardingCompletedAt: 1,
    onboardingSelectedOwnedProjectIds: [],
    pinnedProfileProjectIds: [],
    privacy: {},
    profile: {
      avatarUrl: '',
      bio: '',
      buildStatus: 'building_solo',
      cityId: null,
      displayName: 'Viewer',
      socialLinks: {},
    },
    stats: {},
    unreadMessagesCount: 3,
  },
} as unknown as ViewerBootstrapPayload

function conversation(
  id: string,
  partner: string,
  status: InboxConversation['status'],
  unread = 0,
): InboxConversation {
  const partnerId = `user_${partner.toLowerCase()}`
  return {
    _id: id,
    _creationTime: 1,
    conversationKey: `${VIEWER}:${partnerId}`,
    participantLowId: VIEWER,
    participantHighId: partnerId,
    lastMessage: {
      content: `hello from ${partner}`,
      senderId: status === 'pending' ? VIEWER : partnerId,
      sentAt: 1,
    },
    unreadCounts: { [VIEWER]: unread, [partnerId]: 0 },
    isRequest: status !== 'active',
    createdAt: 1,
    updatedAt: 1,
    status,
    otherUser: {
      userId: partnerId,
      githubUsername: partner.toLowerCase(),
      displayName: partner,
      avatarUrl: '',
      cityName: null,
    },
  } as unknown as InboxConversation
}

async function renderInbox(search: Partial<InboxSearch> = {}) {
  mocks.search = { tab: 'inbox', conversation: null, compose: null, ...search }
  const { Route } = await import('@/routes/_app/inbox')
  const InboxPage = Route.options.component as () => ReactNode
  render(<InboxPage />)

  const list = screen.getByRole('region', { name: 'conversations' })
  const thread = screen.getByRole('region', { name: 'conversation' })
  return {
    list,
    thread,
    mobileView: list.parentElement?.getAttribute('data-mobile-view'),
  }
}

describe('inbox route', () => {
  beforeEach(() => {
    mocks.conversations = [
      conversation('conv_active', 'Ana', 'active', 2),
      conversation('conv_pending', 'Bo', 'pending'),
      conversation('conv_request', 'Cy', 'request', 1),
    ]
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('lists accepted and outgoing pending conversations in the main inbox, not incoming requests', async () => {
    const { list } = await renderInbox()

    const rows = within(list)
      .getAllByRole('button', { name: /^open conversation with/i })
      .map((row) => row.getAttribute('aria-label'))
    expect(rows).toEqual([
      'Open conversation with Ana, 2 unread',
      'Open conversation with Bo, pending',
    ])
  })

  it('lists only incoming requests under requests', async () => {
    const { list } = await renderInbox({ tab: 'requests' })

    const rows = within(list)
      .getAllByRole('button', { name: /^open conversation with/i })
      .map((row) => row.getAttribute('aria-label'))
    expect(rows).toEqual(['Open conversation with Cy, 1 unread'])
  })

  it('shows the server unread count in the header', async () => {
    await renderInbox()

    expect(screen.getByText('3 unread')).toBeTruthy()
  })

  it('shows the list on a phone when the URL selects nothing, with the desktop placeholder beside it', async () => {
    const { mobileView, thread } = await renderInbox()

    expect(mobileView).toBe('list')
    expect(within(thread).getByText('select a conversation')).toBeTruthy()
    expect(
      within(thread).queryByRole('textbox', { name: 'Message' }),
    ).toBeNull()
  })

  it('shows the thread on a phone when the URL selects a conversation, with a way back to the list', async () => {
    const { mobileView, thread } = await renderInbox({
      conversation: 'conv_active',
    })

    expect(mobileView).toBe('thread')
    expect(
      within(thread).getByRole('textbox', { name: 'Message' }),
    ).toBeTruthy()

    within(thread).getByRole('button', { name: 'back' }).click()
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/inbox',
      search: { compose: null, tab: 'inbox', conversation: null },
    })
  })

  it('marks an opened conversation with unread messages read', async () => {
    await renderInbox({ conversation: 'conv_active' })

    expect(mocks.markRead).toHaveBeenCalledWith({
      conversationId: 'conv_active',
    })
  })

  it('files a selected conversation under its own tab when the link names a stale one', async () => {
    const { list, thread } = await renderInbox({
      tab: 'requests',
      conversation: 'conv_pending',
    })

    expect(
      within(list).getByRole('button', {
        name: 'Open conversation with Bo, pending',
      }),
    ).toBeTruthy()
    expect(
      within(thread).getByText('pending: waiting for a reply'),
    ).toBeTruthy()
  })

  it('shows one empty state, not a second placeholder, when there is nothing to list', async () => {
    mocks.conversations = []
    await renderInbox()

    expect(screen.getByText('no conversations yet')).toBeTruthy()
    expect(screen.queryByText('select a conversation')).toBeNull()
  })
})
