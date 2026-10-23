// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { Id } from '../../../../convex/_generated/dataModel'
import {
  DraftConversationPanel,
  DraftConversationView,
} from '../draft-conversation-panel'
import {
  SelectedConversationPanel,
  SelectedConversationView,
} from '../selected-conversation-panel'
import type { ConversationMessages } from '../selected-conversation-panel'
import type { InboxConversation } from '../navigation'

vi.mock('convex/react', () => ({
  useMutation: () => async () => null,
  usePaginatedQuery: () => ({
    results: [],
    status: 'Exhausted',
    loadMore: vi.fn(),
  }),
}))

const recipient = {
  userId: 'user_ana' as Id<'users'>,
  githubUsername: 'ana',
  displayName: 'Ana',
  avatarUrl: null,
  cityName: null,
}
const selected = {
  _id: 'conv_ana',
  status: 'active',
  otherUser: recipient,
  unreadCounts: { viewer: 1 },
} as unknown as InboxConversation
const message = (id: string) =>
  ({
    _id: id,
    _creationTime: 1,
    conversationId: 'conv_ana',
    senderId: 'user_ana',
    content: id,
    createdAt: 1,
    readAt: null,
  }) as ConversationMessages['results'][number]
const originalScroll = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
)
afterEach(() => {
  if (originalScroll)
    Object.defineProperty(
      HTMLElement.prototype,
      'scrollIntoView',
      originalScroll,
    )
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('submits a draft through its feature interface, preserving Shift+Enter and navigation callbacks', async () => {
  const send = vi.fn(async () => 'conv_new' as Id<'conversations'>)
  const created = vi.fn()
  const back = vi.fn()
  const profile = vi.fn()
  render(
    <DraftConversationView
      recipient={recipient}
      sendMessage={send}
      onBack={back}
      onOpenProfile={profile}
      onConversationCreated={created}
    />,
  )
  const input = screen.getByRole('textbox', { name: 'Message' })
  expect(
    (screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  fireEvent.change(input, { target: { value: '  Hello Ana  ' } })
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
  expect(send).not.toHaveBeenCalled()
  await act(async () => fireEvent.keyDown(input, { key: 'Enter' }))
  expect(send).toHaveBeenCalledExactlyOnceWith('Hello Ana')
  expect(created).toHaveBeenCalledExactlyOnceWith('conv_new')
  fireEvent.click(screen.getByRole('button', { name: 'back' }))
  fireEvent.click(screen.getByRole('button', { name: /Ana location hidden/ }))
  expect(back).toHaveBeenCalledOnce()
  expect(profile).toHaveBeenCalledExactlyOnceWith('ana')
})

it('keeps a failed conversation reply available for retry without a router provider', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const send = vi
    .fn()
    .mockRejectedValueOnce(new Error('Temporary failure'))
    .mockResolvedValueOnce(null)
  const markRead = vi.fn()
  render(
    <SelectedConversationView
      selectedConversation={selected}
      viewerId="viewer"
      messagesPage={{ results: [], status: 'Exhausted', loadMore: vi.fn() }}
      sendMessage={send}
      onMarkRead={markRead}
      onBack={vi.fn()}
      onOpenProfile={vi.fn()}
    />,
  )
  expect(markRead).toHaveBeenCalledOnce()
  const input = screen.getByRole('textbox', {
    name: 'Message',
  }) as HTMLTextAreaElement
  fireEvent.change(input, { target: { value: 'Keep my reply' } })
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Send message' })),
  )
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(input.value).toBe('Keep my reply')
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Send message' })),
  )
  expect(send).toHaveBeenLastCalledWith('Keep my reply')
  expect(input.value).toBe('')
  expect(screen.queryByRole('alert')).toBeNull()
})

it('does not pull a reader back to the newest incoming message while they read older history', () => {
  const scrollIntoView = vi.fn()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  })
  const page = (results: ConversationMessages['results']) => (
    <SelectedConversationView
      selectedConversation={selected}
      viewerId="viewer"
      messagesPage={{ results, status: 'CanLoadMore', loadMore: vi.fn() }}
      sendMessage={async () => {}}
      onMarkRead={vi.fn()}
      onBack={vi.fn()}
      onOpenProfile={vi.fn()}
    />
  )
  const { rerender } = render(page([message('initial')]))
  const scroll = screen.getByRole('button', {
    name: 'load older messages',
  }).parentElement!
  Object.defineProperties(scroll, {
    scrollHeight: { configurable: true, value: 1000 },
    clientHeight: { configurable: true, value: 100 },
  })
  scroll.scrollTop = 100
  fireEvent.scroll(scroll)
  rerender(page([message('new incoming'), message('initial')]))
  expect(scrollIntoView).not.toHaveBeenCalled()
  expect(scroll.scrollTop).toBe(100)
})

it('owns draft recipient identity even when a caller does not supply a key', () => {
  const props = {
    onBack: vi.fn(),
    onOpenProfile: vi.fn(),
    onConversationCreated: vi.fn(),
  }
  const { rerender } = render(
    <DraftConversationPanel {...props} recipient={recipient} />,
  )
  const input = () =>
    screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
  fireEvent.change(input(), { target: { value: 'For Ana only' } })
  rerender(
    <DraftConversationPanel
      {...props}
      recipient={{
        ...recipient,
        userId: 'user_bo' as Id<'users'>,
        displayName: 'Bo',
        githubUsername: 'bo',
      }}
    />,
  )
  expect(input().value).toBe('')
})

it('owns conversation identity even when a caller does not supply a key', () => {
  const props = { onBack: vi.fn(), onOpenProfile: vi.fn(), viewerId: 'viewer' }
  const { rerender } = render(
    <SelectedConversationPanel {...props} selectedConversation={selected} />,
  )
  const input = () =>
    screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
  fireEvent.change(input(), { target: { value: 'For this thread only' } })
  rerender(
    <SelectedConversationPanel
      {...props}
      selectedConversation={{
        ...selected,
        _id: 'conv_bo' as Id<'conversations'>,
      }}
    />,
  )
  expect(input().value).toBe('')
})
