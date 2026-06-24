// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReactionBar } from '../reaction-bar'

const mocks = vi.hoisted(() => ({
  reactToTarget: vi.fn(),
  unreactFromTarget: vi.fn(),
}))

const reactionConfigs = [
  {
    key: 'like',
    label: 'Like',
    emoji: 'heart',
    icon: 'heart-filled',
  },
  {
    key: 'rocket',
    label: 'Rocket',
    emoji: 'rocket',
    icon: 'rocket',
  },
  {
    key: 'flame',
    label: 'Fire',
    emoji: 'flame',
    icon: 'flame',
  },
]

vi.mock('convex/react', () => ({
  useQuery: () => reactionConfigs,
}))

vi.mock('../../../../../convex/_generated/api', () => ({
  api: {
    reactions: { listConfig: 'reactions.listConfig' },
  },
}))

vi.mock('@/features/projects/mutations', () => ({
  useReactToTarget: () => mocks.reactToTarget,
  useUnreactFromTarget: () => mocks.unreactFromTarget,
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
    PopoverContent: ({ children }: { children: React.ReactNode }) => {
      const context = React.useContext(PopoverContext)
      return context?.open ? <div>{children}</div> : null
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
      screen.getByRole('button', { name: 'Remove Rocket reaction' })
        .textContent,
    ).toContain('0')
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

  it('disables reaction controls when disabled', () => {
    renderReactionBar({ disabled: true })

    expect(
      screen.getByRole('button', { name: 'Add Like reaction' }),
    ).toHaveProperty('disabled', true)
    expect(
      screen.getByRole('button', { name: 'Add post reaction' }),
    ).toHaveProperty('disabled', true)
  })
})
