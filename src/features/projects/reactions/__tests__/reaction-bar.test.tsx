// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { ReactionBar } from '../reaction-bar'

const mocks = vi.hoisted(() => ({
  reactToTarget: vi.fn(),
  unreactFromTarget: vi.fn(),
}))

const reactionConfigs = [
  {
    key: 'like',
    label: 'Like',
    emoji: '❤️',
    color: '#f2555f',
  },
  {
    key: 'rocket',
    label: 'Rocket',
    emoji: '🚀',
    color: '#a78bfa',
  },
  {
    key: 'fire',
    label: 'Fire',
    emoji: '🔥',
    color: '#fbbf24',
  },
  {
    key: 'eyes',
    label: 'Watching',
    emoji: '👀',
    color: '#60a5fa',
  },
  {
    key: 'bad-color',
    label: 'Bad Color',
    emoji: '🎉',
    color: 'oklch(70% 0.18 350)',
  },
]

vi.mock('convex/react', () => ({
  useQuery: () => reactionConfigs,
}))

vi.mock('../../../../../convex/_generated/api', () => ({
  api: {
    reactions: {
      listConfig: 'reactions.listConfig',
    },
  },
}))

vi.mock('@/features/projects/mutations', () => ({
  useReactToTarget: () => mocks.reactToTarget,
  useUnreactFromTarget: () => mocks.unreactFromTarget,
}))

vi.mock('../project-reactor-inspector', () => ({
  ReactorInspector: ({ children }: { children: ReactNode }) => children,
  ProjectReactorInspector: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('@/components/ui/popover', async () => {
  const React = await import('react')
  const PopoverContext = React.createContext<{
    open: boolean
    onOpenChange: (open: boolean) => void
  } | null>(null)

  return {
    Popover: ({
      children,
      onOpenChange,
      open,
    }: {
      children: React.ReactNode
      onOpenChange: (open: boolean) => void
      open: boolean
    }) => (
      <PopoverContext.Provider value={{ onOpenChange, open }}>
        {children}
      </PopoverContext.Provider>
    ),
    PopoverContent: ({
      children,
      className,
    }: {
      children: React.ReactNode
      className?: string
    }) => {
      const context = React.useContext(PopoverContext)
      return context?.open ? <div className={className}>{children}</div> : null
    },
    PopoverTrigger: ({ children }: { children: React.ReactElement }) => {
      const context = React.useContext(PopoverContext)
      return React.cloneElement(children, {
        onClick: () => context?.onOpenChange(true),
      } as React.HTMLAttributes<HTMLElement>)
    },
  }
})

function renderReactionBar(
  overrides: Partial<Parameters<typeof ReactionBar>[0]> = {},
) {
  return render(
    <ReactionBar
      disabled={false}
      reactionCounts={{ like: 2 }}
      targetId="post_1"
      targetType="post"
      viewerReactionTypes={[]}
      {...overrides}
    />,
  )
}

describe('ReactionBar', () => {
  beforeEach(() => {
    mocks.reactToTarget.mockReset()
    mocks.unreactFromTarget.mockReset()
    mocks.reactToTarget.mockResolvedValue({})
    mocks.unreactFromTarget.mockResolvedValue(null)
  })

  it('renders counted reactions and active viewer-only reactions', () => {
    renderReactionBar({
      reactionCounts: { like: 2 },
      viewerReactionTypes: ['rocket'],
    })

    expect(
      screen.getByRole('button', { name: 'Add Like reaction' }).textContent,
    ).toContain('2')
    expect(
      screen.getByRole('button', { name: 'Add Like reaction' }).textContent,
    ).toContain('❤️')
    expect(
      screen.getByRole('button', { name: 'Remove Rocket reaction' })
        .textContent,
    ).toContain('0')
    expect(
      screen.getByRole('button', { name: 'Remove Rocket reaction' })
        .textContent,
    ).toContain('🚀')
  })

  it('pins the heart first for project reactions even at zero', () => {
    renderReactionBar({
      reactionCounts: {},
      targetType: 'project',
      viewerReactionTypes: [],
    })

    const buttons = screen.getAllByRole('button')
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Add Like reaction')
    expect(buttons[0]?.textContent).toContain('0')
  })

  it('disables toggles when a cached payload lacks viewer reaction state', () => {
    renderReactionBar({ viewerReactionTypes: undefined })

    expect(
      screen.getByRole('button', { name: 'Add Like reaction' }),
    ).toHaveProperty('disabled', true)
    expect(mocks.reactToTarget).not.toHaveBeenCalled()
    expect(mocks.unreactFromTarget).not.toHaveBeenCalled()
  })

  it('adds a reaction from the picker', async () => {
    renderReactionBar({ reactionCounts: {} })

    fireEvent.click(screen.getByRole('button', { name: 'Add post reaction' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Rocket reaction' }))

    await waitFor(() =>
      expect(mocks.reactToTarget).toHaveBeenCalledWith({
        reactionType: 'rocket',
        targetId: 'post_1',
        targetType: 'post',
      }),
    )
  })

  it('removes an active reaction from a chip', async () => {
    renderReactionBar({
      reactionCounts: { like: 4 },
      viewerReactionTypes: ['like'],
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Like reaction' }),
    )

    await waitFor(() =>
      expect(mocks.unreactFromTarget).toHaveBeenCalledWith({
        reactionType: 'like',
        targetId: 'post_1',
        targetType: 'post',
      }),
    )
  })

  it('optimistically subtracts and hides a reaction when its count reaches zero', () => {
    mocks.unreactFromTarget.mockReturnValue(new Promise(() => {}))
    const firstRender = renderReactionBar({
      reactionCounts: { like: 2 },
      viewerReactionTypes: ['like'],
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Like reaction' }),
    )
    expect(
      screen.getByRole('button', { name: 'Add Like reaction' }).textContent,
    ).toContain('1')

    firstRender.unmount()
    render(
      <ReactionBar
        disabled={false}
        reactionCounts={{ like: 1 }}
        targetId="post_2"
        targetType="post"
        viewerReactionTypes={['like']}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Like reaction' }),
    )
    expect(screen.queryByRole('button', { name: /Like reaction/ })).toBeNull()
  })

  it('shows optimistic count changes while a mutation is pending', async () => {
    let resolveReaction: () => void = () => {}
    mocks.reactToTarget.mockReturnValue(
      new Promise((resolve) => {
        resolveReaction = () => resolve({})
      }),
    )
    renderReactionBar({ reactionCounts: { like: 2 } })

    fireEvent.click(screen.getByRole('button', { name: 'Add Like reaction' }))

    expect(
      screen.getByRole('button', { name: 'Remove Like reaction' }).textContent,
    ).toContain('3')

    resolveReaction()
    await waitFor(() => expect(mocks.reactToTarget).toHaveBeenCalled())
  })

  it('rolls optimistic state back when a mutation fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.reactToTarget.mockRejectedValue(new Error('nope'))
    renderReactionBar({ reactionCounts: { like: 2 } })

    fireEvent.click(screen.getByRole('button', { name: 'Add Like reaction' }))

    expect(
      screen.getByRole('button', { name: 'Remove Like reaction' }).textContent,
    ).toContain('3')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add Like reaction' }).textContent,
      ).toContain('2'),
    )
  })

  it('colors an active reaction with its own color, not generic brand teal', () => {
    renderReactionBar({
      reactionCounts: { rocket: 1 },
      viewerReactionTypes: ['rocket'],
    })

    const rocket = screen.getByRole('button', {
      name: 'Remove Rocket reaction',
    })
    expect(rocket.style.color).not.toBe('')
    expect(rocket.style.color).not.toBe('var(--lx-accent)')
    expect(rocket.querySelector('svg')).toBeNull()
    expect(rocket.textContent).toContain('🚀')
    expect(rocket.className).not.toContain('text-brand')
  })

  it('gives different reactions different active colors', () => {
    const { rerender } = render(
      <ReactionBar
        disabled={false}
        reactionCounts={{ like: 1 }}
        targetId="post_1"
        targetType="post"
        viewerReactionTypes={['like']}
      />,
    )
    const likeColor = screen.getByRole('button', {
      name: 'Remove Like reaction',
    }).style.color

    rerender(
      <ReactionBar
        disabled={false}
        reactionCounts={{ rocket: 1 }}
        targetId="post_1"
        targetType="post"
        viewerReactionTypes={['rocket']}
      />,
    )
    const rocketColor = screen.getByRole('button', {
      name: 'Remove Rocket reaction',
    }).style.color

    expect(likeColor).not.toBe('')
    expect(rocketColor).not.toBe('')
    expect(likeColor).not.toBe(rocketColor)
  })

  it('falls back to brand teal when a reaction config has an invalid color', () => {
    renderReactionBar({
      reactionCounts: { 'bad-color': 1 },
      viewerReactionTypes: ['bad-color'],
    })

    const badColor = screen.getByRole('button', {
      name: 'Remove Bad Color reaction',
    })

    expect(badColor.style.color).toBe('var(--lx-accent)')
    expect(badColor.style.backgroundColor).toBe('')
    expect(badColor.querySelector('svg')).toBeNull()
    expect(badColor.textContent).toContain('🎉')
  })

  it('renders emoji picker items without svg icons', () => {
    renderReactionBar({ reactionCounts: {} })

    fireEvent.click(screen.getByRole('button', { name: 'Add post reaction' }))
    const picker = screen.getByTestId('reaction-picker')

    expect(picker.textContent).toContain('👀')
    expect(picker.querySelector('svg')).toBeNull()
    expect(
      within(picker).getByRole('button', {
        name: 'Add Watching reaction',
      }),
    ).toBeTruthy()
  })

  it('renders one content-sized picker button per configured reaction', () => {
    renderReactionBar({ reactionCounts: {} })

    fireEvent.click(screen.getByRole('button', { name: 'Add post reaction' }))

    const picker = screen.getByTestId('reaction-picker')
    const popover = picker.parentElement
    expect(picker.className).toContain('inline-flex')
    expect(picker.className).not.toContain('grid-cols-6')
    expect(popover?.className).toContain('w-max')
    expect(within(picker).getAllByRole('button')).toHaveLength(
      reactionConfigs.length,
    )
  })

  it('keeps pop and burst animation hooks for emoji reactions', async () => {
    let resolveReaction: () => void = () => {}
    mocks.reactToTarget.mockReturnValue(
      new Promise((resolve) => {
        resolveReaction = () => resolve({})
      }),
    )
    renderReactionBar({ reactionCounts: { rocket: 1 } })

    fireEvent.click(screen.getByRole('button', { name: 'Add Rocket reaction' }))

    const rocket = screen.getByRole('button', {
      name: 'Remove Rocket reaction',
    })
    expect(rocket.className).toContain('lx-reaction-pop')
    expect(rocket.querySelector('.lx-reaction-burst')).toBeTruthy()

    resolveReaction()
    await waitFor(() => expect(mocks.reactToTarget).toHaveBeenCalled())
  })

  it('disables reaction controls when disabled', () => {
    renderReactionBar({ disabled: true })

    expect(
      screen.getByRole('button', { name: 'View Like reactions' }),
    ).toHaveProperty('disabled', false)
    expect(
      screen.getByRole('button', { name: 'Add post reaction' }),
    ).toHaveProperty('disabled', true)

    fireEvent.click(screen.getByRole('button', { name: 'View Like reactions' }))
    expect(mocks.reactToTarget).not.toHaveBeenCalled()
    expect(mocks.unreactFromTarget).not.toHaveBeenCalled()
  })
})
