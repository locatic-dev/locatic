// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ReactorInspector } from '../project-reactor-inspector'

const mocks = vi.hoisted(() => ({
  loadMore: vi.fn(),
}))

vi.mock('convex/react', () => ({
  usePaginatedQuery: () => ({
    loadMore: mocks.loadMore,
    results: [
      {
        userId: 'user_1',
        githubUsername: 'reactor',
        displayName: 'Reactor User',
        avatarUrl: null,
      },
    ],
    status: 'CanLoadMore',
  }),
}))

vi.mock('../../../../../convex/_generated/api', () => ({
  api: { reactions: { listReactors: 'listReactors' } },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    className,
    onClick,
  }: {
    children: React.ReactNode
    className?: string
    onClick?: () => void
  }) => (
    <a
      className={className}
      href="/u/reactor"
      onClick={(event) => {
        event.preventDefault()
        onClick?.()
      }}
    >
      {children}
    </a>
  ),
}))

function renderInspector(actionProps: React.ComponentProps<'button'> = {}) {
  return render(
    <>
      <ReactorInspector
        action={
          <button type="button" {...actionProps}>
            toggle reaction
          </button>
        }
        count={2}
        emoji="❤️"
        label="Like"
        targetId="project_1"
        targetType="project"
        reactionType="like"
      />
      <button type="button">outside</button>
    </>,
  )
}

describe('ReactorInspector', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.loadMore.mockReset()
  })

  afterEach(() => {
    if (vi.isFakeTimers()) vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('uses separate reaction and dialog controls with real keyboard traversal', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    renderInspector()

    await user.tab()
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'toggle reaction' }),
    )
    await user.tab()
    const detailsTrigger = screen.getByRole('button', {
      name: 'View 2 Like reactions',
    })
    expect(document.activeElement).toBe(detailsTrigger)

    expect(await screen.findByRole('dialog')).toBeTruthy()

    await user.tab()
    expect(document.activeElement).toBe(
      screen.getByRole('link', { name: /Reactor User/ }),
    )
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(detailsTrigger)
  })

  it('keeps the popover open while pointer moves into portalled content', async () => {
    renderInspector()
    const anchor = screen
      .getByRole('button', { name: 'toggle reaction' })
      .closest('[data-reactor-inspector]')
    expect(anchor).not.toBeNull()

    fireEvent.pointerEnter(anchor!, { pointerType: 'mouse' })
    await act(() => vi.advanceTimersByTime(250))
    const dialog = screen.getByRole('dialog')
    fireEvent.pointerLeave(anchor!, { pointerType: 'mouse' })
    fireEvent.pointerEnter(dialog, { pointerType: 'mouse' })
    await act(() => vi.advanceTimersByTime(500))

    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('dismisses with Escape from content and restores details-trigger focus', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    renderInspector()
    const detailsTrigger = screen.getByRole('button', {
      name: 'View 2 Like reactions',
    })

    await user.click(detailsTrigger)
    expect(document.activeElement).toBe(
      screen.getByRole('link', { name: /Reactor User/ }),
    )
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(detailsTrigger)
  })

  it('dismisses on outside interaction without stealing outside focus', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    renderInspector()
    await user.click(
      screen.getByRole('button', { name: 'View 2 Like reactions' }),
    )

    const outside = screen.getByRole('button', { name: 'outside' })
    await user.click(outside)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(outside)
  })

  it('opens on long-press, suppresses click and native context menu', async () => {
    const onClick = vi.fn()
    renderInspector({ onClick })
    const action = screen.getByRole('button', { name: 'toggle reaction' })

    fireEvent.pointerDown(action, { pointerType: 'touch' })
    await act(() => vi.advanceTimersByTime(450))
    fireEvent.pointerCancel(action, { pointerType: 'touch' })
    const contextMenu = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    })
    action.dispatchEvent(contextMenu)
    fireEvent.click(action)

    expect(contextMenu.defaultPrevented).toBe(true)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('cancels a pre-threshold long-press and preserves child handlers', async () => {
    const onClick = vi.fn()
    const onPointerCancel = vi.fn()
    renderInspector({ onClick, onPointerCancel })
    const action = screen.getByRole('button', { name: 'toggle reaction' })

    fireEvent.pointerDown(action, { pointerType: 'touch' })
    fireEvent.pointerCancel(action, { pointerType: 'touch' })
    await act(() => vi.advanceTimersByTime(500))
    fireEvent.click(action)

    expect(onPointerCancel).toHaveBeenCalledOnce()
    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes before profile navigation and loads additional reactors', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    renderInspector()
    await user.click(
      screen.getByRole('button', { name: 'View 2 Like reactions' }),
    )

    await user.click(screen.getByRole('button', { name: 'load more' }))
    expect(mocks.loadMore).toHaveBeenCalledWith(12)

    await user.click(screen.getByRole('link', { name: /Reactor User/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('cleans every pending timer on unmount', () => {
    const { unmount } = renderInspector()
    const action = screen.getByRole('button', { name: 'toggle reaction' })
    fireEvent.pointerDown(action, { pointerType: 'touch' })
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
