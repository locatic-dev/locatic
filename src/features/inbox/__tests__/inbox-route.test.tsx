// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ConversationDetailPayload,
  ViewerBootstrapPayload,
} from '@/features/contracts'
import type { InboxConversation } from '../navigation'

type QueryOptions = { queryKey: [string, string, unknown] }
type InboxSearch = {
  tab: 'inbox' | 'requests'
  conversation: string | null
  compose: string | null
}

const mocks = vi.hoisted(() => ({
  conversations: [] as unknown[],
  messages: [] as ConversationDetailPayload['messages'],
  messagesStatus: 'Exhausted',
  extraSummary: null as InboxConversation | null,
  summaryLoading: false,
  listStatus: 'Exhausted',
  loadMore: vi.fn(),
  markRead: vi.fn(),
  sendMessage: vi.fn(),
  sendFirstMessage: vi.fn(),
  navigate: vi.fn(),
  search: { tab: 'inbox', conversation: null, compose: null } as {
    tab: 'inbox' | 'requests'
    conversation: string | null
    compose: string | null
  },
}))

vi.mock('@tanstack/react-router', () => ({
  stripSearchParams: () => () => ({}),
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
  useQuery: ({ queryKey: [, name, args] }: QueryOptions) => {
    if (name === 'conversations:getSummary') {
      const id = (args as { conversationId?: string })?.conversationId
      return {
        data:
          mocks.conversations.find(
            (row) => (row as InboxConversation)._id === id,
          ) ?? mocks.extraSummary,
        isLoading: mocks.summaryLoading,
      }
    }
    const userId = (args as { otherUserId?: string })?.otherUserId
    return {
      data: userId
        ? {
            userId,
            githubUsername: userId,
            displayName: userId,
            avatarUrl: null,
            cityName: null,
          }
        : undefined,
      isLoading: false,
    }
  },
}))

vi.mock('convex/react', () => ({
  usePaginatedQuery: (_ref: unknown, args: { side?: string }) => ({
    results:
      args.side === 'low'
        ? mocks.conversations
        : args.side
          ? []
          : mocks.messages,
    status: args.side ? mocks.listStatus : mocks.messagesStatus,
    loadMore: mocks.loadMore,
  }),
}))

vi.mock('@/features/inbox/mutations', () => ({
  useMarkConversationRead: () => mocks.markRead,
  useSendFirstMessage: () => mocks.sendFirstMessage,
  useSendMessage: () => mocks.sendMessage,
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
  const view = render(<InboxPage />)

  const list = screen.getByRole('region', { name: 'conversations' })
  const thread = screen.getByRole('region', { name: 'conversation' })
  return {
    list,
    thread,
    mobileView: list.parentElement?.getAttribute('data-mobile-view'),
    rerender: () => view.rerender(<InboxPage />),
  }
}

describe('inbox route', () => {
  beforeEach(() => {
    mocks.messages = []
    mocks.messagesStatus = 'Exhausted'
    mocks.extraSummary = null
    mocks.summaryLoading = false
    mocks.listStatus = 'Exhausted'
    mocks.conversations = [
      conversation('conv_active', 'Ana', 'active', 2),
      conversation('conv_pending', 'Bo', 'pending'),
      conversation('conv_request', 'Cy', 'request', 1),
    ]
  })

  it('opens an older conversation independently of the loaded list page', async () => {
    mocks.extraSummary = conversation('older', 'Older Partner', 'active')
    const { thread, mobileView } = await renderInbox({ conversation: 'older' })
    expect(mobileView).toBe('thread')
    expect(
      within(thread).getByRole('textbox', { name: 'Message' }),
    ).toBeTruthy()
    expect(within(thread).getByText('Older Partner')).toBeTruthy()
  })

  it('offers more history without a false empty state while the list has another page', async () => {
    mocks.conversations = []
    mocks.listStatus = 'CanLoadMore'
    const { list } = await renderInbox()
    expect(within(list).queryByText('no conversations yet')).toBeNull()
    fireEvent.click(
      within(list).getByRole('button', { name: 'load more conversations' }),
    )
    expect(mocks.loadMore).toHaveBeenCalledWith(30)
  })

  it('keeps an older deep link in the detail pane while its summary loads', async () => {
    mocks.summaryLoading = true
    const { thread, mobileView } = await renderInbox({ conversation: 'older' })
    expect(mobileView).toBe('thread')
    expect(
      within(thread).getByRole('status', { name: 'loading conversation' }),
    ).toBeTruthy()
  })

  it('explains an unavailable conversation instead of silently showing the list', async () => {
    const { thread } = await renderInbox({ conversation: 'missing' })
    expect(
      within(thread).getByText("couldn't open this conversation"),
    ).toBeTruthy()
    expect(
      within(thread).queryByRole('textbox', { name: 'Message' }),
    ).toBeNull()
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

  it('does not carry an unsent draft into another conversation', async () => {
    const { rerender } = await renderInbox({ conversation: 'conv_active' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'For Ana only' },
    })

    mocks.search = { ...mocks.search, conversation: 'conv_pending' }
    rerender()

    expect(
      (screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement)
        .value,
    ).toBe('')
    expect(
      (
        screen.getByRole('button', {
          name: 'Send message',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'For Bo only' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    })
    expect(mocks.sendMessage).toHaveBeenCalledWith({
      conversationId: 'conv_pending',
      content: 'For Bo only',
    })
  })

  it('does not clear a new recipient draft when an old send completes', async () => {
    let finishSend!: () => void
    mocks.sendMessage.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSend = resolve
        }),
    )
    const { rerender } = await renderInbox({ conversation: 'conv_active' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'Send to Ana' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    mocks.search = { ...mocks.search, conversation: 'conv_pending' }
    rerender()
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'Keep Bo draft' },
    })
    expect(
      (
        screen.getByRole('button', {
          name: 'Send message',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
    await act(async () => finishSend())

    expect(
      (screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement)
        .value,
    ).toBe('Keep Bo draft')
  })

  it('does not carry an unsent first message into another recipient', async () => {
    const { rerender } = await renderInbox({ compose: 'user_ana' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'For Ana only' },
    })

    mocks.search = { ...mocks.search, compose: 'user_bo' }
    rerender()

    expect(
      (screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement)
        .value,
    ).toBe('')
  })

  it('does not navigate away from a new recipient when an old first send completes', async () => {
    let finishSend!: (result: { conversationId: string }) => void
    mocks.sendFirstMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSend = resolve
        }),
    )
    const { rerender } = await renderInbox({ compose: 'user_ana' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'Send to Ana' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    mocks.search = { ...mocks.search, compose: 'user_bo' }
    rerender()
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'Keep Bo draft' },
    })
    expect(
      (
        screen.getByRole('button', {
          name: 'Send message',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
    await act(async () => finishSend({ conversationId: 'conv_ana' }))

    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(
      (screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement)
        .value,
    ).toBe('Keep Bo draft')
  })

  it('keeps a failed first message available for retry and opens the profile through the route', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.sendFirstMessage.mockRejectedValueOnce(
      new Error('Send temporarily unavailable'),
    )
    await renderInbox({ compose: 'user_ana' })
    const input = screen.getByRole('textbox', {
      name: 'Message',
    }) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'Keep this message' } })
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Send message' })),
    )
    expect(input.value).toBe('Keep this message')
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(mocks.navigate).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: /user_ana location hidden/ }),
    )
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '/u/$username',
        params: { username: 'user_ana' },
      }),
    )
    mocks.sendFirstMessage.mockResolvedValueOnce({
      conversationId: 'retry-conversation',
    })
    await act(async () => fireEvent.keyDown(input, { key: 'Enter' }))
    expect(mocks.sendFirstMessage).toHaveBeenLastCalledWith({
      otherUserId: 'user_ana',
      content: 'Keep this message',
    })
    expect(mocks.navigate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: {
          conversation: 'retry-conversation',
          compose: null,
          tab: 'inbox',
        },
      }),
    )
  })

  it('preserves the visible message position when older history is prepended', async () => {
    mocks.messagesStatus = 'CanLoadMore'
    const message = (id: string, content: string) =>
      ({
        _id: id,
        _creationTime: 1,
        conversationId: 'conv_active',
        senderId: 'user_ana',
        content,
        createdAt: 1,
        readAt: null,
      }) as ConversationDetailPayload['messages'][number]
    mocks.messages = [message('newest', 'Newest message')]
    const { rerender } = await renderInbox({ conversation: 'conv_active' })
    const olderButton = screen.getByRole('button', {
      name: 'load older messages',
    })
    const scroll = olderButton.parentElement!
    let height = 200
    Object.defineProperty(scroll, 'scrollHeight', {
      configurable: true,
      get: () => height,
    })
    scroll.scrollTop = 50
    fireEvent.click(olderButton)
    expect(mocks.loadMore).toHaveBeenCalledWith(30)
    height = 320
    mocks.messages = [...mocks.messages, message('older', 'Older message')]
    mocks.messagesStatus = 'Exhausted'
    rerender()
    expect(scroll.scrollTop).toBe(170)
    expect(
      screen
        .getByText('Older message')
        .compareDocumentPosition(screen.getByText('Newest message')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('opens the new conversation when its recipient is still selected after sending', async () => {
    mocks.sendFirstMessage.mockResolvedValueOnce({ conversationId: 'conv_ana' })
    await renderInbox({ compose: 'user_ana' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'Hello Ana' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    })

    expect(mocks.sendFirstMessage).toHaveBeenCalledWith({
      otherUserId: 'user_ana',
      content: 'Hello Ana',
    })
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/inbox',
      search: { conversation: 'conv_ana', compose: null, tab: 'inbox' },
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
