import { useQuery } from 'convex/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType } from 'react'

import { api } from '../../../../convex/_generated/api'
import { Eye, Flame, Heart, PartyPopper, Plus, Rocket } from '@/lib/icons'
import { cn } from '@/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  useReactToTarget,
  useUnreactFromTarget,
} from '@/features/projects/mutations'

type ReactionTargetType = 'post' | 'comment'

type ReactionConfig = {
  key?: string
  label: string
  emoji: string
  icon?: string
}

type PendingReaction = {
  reactionType: string
  nextActive: boolean
} | null

type ReactionIconProps = {
  size?: number
  strokeWidth?: number
  fill?: string
  className?: string
}

const reactionIcons: Record<string, ComponentType<ReactionIconProps>> = {
  eye: Eye,
  flame: Flame,
  heart: Heart,
  'heart-filled': Heart,
  'party-popper': PartyPopper,
  rocket: Rocket,
}

function getReactionIcon(config: ReactionConfig) {
  return reactionIcons[config.icon ?? config.emoji] ?? Heart
}

function getVisibleReactionTypes(
  reactionConfigs: ReactionConfig[],
  reactionCounts: Record<string, number>,
  viewerReactionTypes: string[],
) {
  const configuredTypes = reactionConfigs.flatMap((config) =>
    config.key ? [config.key] : [],
  )
  const visibleTypes = new Set([
    ...configuredTypes.filter((type) => (reactionCounts[type] ?? 0) > 0),
    ...viewerReactionTypes,
  ])

  return configuredTypes.filter((type) => visibleTypes.has(type))
}

function getOptimisticReactionState({
  pendingReaction,
  reactionCounts,
  reactionType,
  viewerReactionTypes,
}: {
  pendingReaction: PendingReaction
  reactionCounts: Record<string, number>
  reactionType: string
  viewerReactionTypes: string[]
}) {
  const currentlyActive = viewerReactionTypes.includes(reactionType)
  const pendingApplies = pendingReaction?.reactionType === reactionType
  const active = pendingApplies ? pendingReaction.nextActive : currentlyActive
  const delta = pendingApplies
    ? pendingReaction.nextActive === currentlyActive
      ? 0
      : pendingReaction.nextActive
        ? 1
        : -1
    : 0

  return {
    active,
    count: Math.max(0, (reactionCounts[reactionType] ?? 0) + delta),
  }
}

export function ReactionBar({
  className,
  disabled,
  reactionCounts,
  targetId,
  targetType,
  viewerReactionTypes,
}: {
  className?: string
  disabled: boolean
  reactionCounts: Record<string, number>
  targetId: string
  targetType: ReactionTargetType
  viewerReactionTypes: string[]
}) {
  const configs = useQuery(api.reactions.listConfig, { targetType })
  const reactToTarget = useReactToTarget()
  const unreactFromTarget = useUnreactFromTarget()
  const [open, setOpen] = useState(false)
  const [pendingReaction, setPendingReaction] = useState<PendingReaction>(null)
  const [burstReaction, setBurstReaction] = useState<string | null>(null)
  const [popReaction, setPopReaction] = useState<string | null>(null)
  const animationTimersRef = useRef<number[]>([])
  const reactionConfigs = useMemo(
    () =>
      ((configs ?? []) as ReactionConfig[]).filter(
        (config): config is ReactionConfig & { key: string } =>
          Boolean(config.key),
      ),
    [configs],
  )
  const visibleReactionTypes = getVisibleReactionTypes(
    reactionConfigs,
    reactionCounts,
    viewerReactionTypes,
  )

  useEffect(
    () => () => {
      for (const timer of animationTimersRef.current) {
        window.clearTimeout(timer)
      }
      animationTimersRef.current = []
    },
    [],
  )

  const handleToggleReaction = async (reactionType: string) => {
    if (disabled || pendingReaction) {
      return
    }

    for (const timer of animationTimersRef.current) {
      window.clearTimeout(timer)
    }
    animationTimersRef.current = []
    const currentlyActive = viewerReactionTypes.includes(reactionType)
    const nextActive = !currentlyActive
    setPendingReaction({ reactionType, nextActive })
    setBurstReaction(reactionType)
    setPopReaction(reactionType)
    animationTimersRef.current = [
      window.setTimeout(() => setBurstReaction(null), 460),
      window.setTimeout(() => setPopReaction(null), 260),
    ]

    try {
      if (currentlyActive) {
        await unreactFromTarget({
          reactionType,
          targetId,
          targetType,
        })
      } else {
        await reactToTarget({
          reactionType,
          targetId,
          targetType,
        })
      }
      setOpen(false)
    } catch (error) {
      console.error(error)
    } finally {
      setPendingReaction(null)
    }
  }

  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-1.5 font-mono text-[11.5px]',
        className,
      )}
    >
      {visibleReactionTypes.map((reactionType) => {
        const config = reactionConfigs.find((item) => item.key === reactionType)
        if (!config) {
          return null
        }

        const Icon = getReactionIcon(config)
        const { active, count } = getOptimisticReactionState({
          pendingReaction,
          reactionCounts,
          reactionType,
          viewerReactionTypes,
        })

        if (count <= 0 && !active) {
          return null
        }

        return (
          <button
            key={reactionType}
            type="button"
            onClick={() => void handleToggleReaction(reactionType)}
            disabled={disabled || Boolean(pendingReaction)}
            aria-label={`${active ? 'Remove' : 'Add'} ${config.label} reaction`}
            aria-pressed={active}
            className={cn(
              'lx-reaction-chip relative inline-flex min-h-11 items-center gap-1.5 rounded-md border px-2 py-2 transition-colors',
              active
                ? 'border-brand/50 bg-brand-quiet text-brand'
                : 'border-transparent bg-transparent text-text-faint hover:border-line hover:text-text',
              popReaction === reactionType && 'lx-reaction-pop',
            )}
          >
            <Icon
              size={14}
              strokeWidth={1.7}
              fill={
                active &&
                (config.icon === 'heart-filled' || config.key === 'like')
                  ? 'currentColor'
                  : 'none'
              }
            />
            <span className="tabular-nums">{count}</span>
            {burstReaction === reactionType && (
              <span aria-hidden="true" className="lx-reaction-burst">
                <span />
                <span />
                <span />
              </span>
            )}
          </button>
        )
      })}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled || reactionConfigs.length === 0}
            aria-label={`Add ${targetType} reaction`}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-transparent bg-transparent text-text-faint transition-colors hover:border-line hover:text-text disabled:opacity-60"
          >
            <Plus size={14} strokeWidth={1.7} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="top"
          sideOffset={8}
          collisionPadding={12}
          className="w-auto rounded-md border-line bg-surface p-1.5 shadow-floating"
        >
          <div className="grid grid-cols-6 gap-1">
            {reactionConfigs.map((config) => {
              const Icon = getReactionIcon(config)
              const reactionType = config.key
              const { active } = getOptimisticReactionState({
                pendingReaction,
                reactionCounts,
                reactionType,
                viewerReactionTypes,
              })

              return (
                <button
                  key={reactionType}
                  type="button"
                  onClick={() => void handleToggleReaction(reactionType)}
                  disabled={disabled || Boolean(pendingReaction)}
                  aria-label={`${active ? 'Remove' : 'Add'} ${config.label} reaction`}
                  aria-pressed={active}
                  title={config.label}
                  className={cn(
                    'lx-reaction-picker-item inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60',
                    active && 'bg-brand-quiet text-brand',
                    popReaction === reactionType && 'lx-reaction-pop',
                  )}
                >
                  <Icon
                    size={17}
                    strokeWidth={1.7}
                    fill={
                      active &&
                      (config.icon === 'heart-filled' || config.key === 'like')
                        ? 'currentColor'
                        : 'none'
                    }
                  />
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
