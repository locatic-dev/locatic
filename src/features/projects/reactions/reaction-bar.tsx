import { useQuery } from 'convex/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

import { api } from '../../../../convex/_generated/api'
import { Plus } from '@/lib/icons'
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
  color?: string
}

type PendingReaction = {
  reactionType: string
  nextActive: boolean
} | null

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** Per-reaction accent color, falling back to the brand teal when unset. */
function reactionAccent(config: ReactionConfig) {
  return config.color && HEX_COLOR_RE.test(config.color)
    ? config.color
    : 'var(--lx-accent)'
}

/**
 * Inline style for a reaction chip: always exposes the accent as `--lx-burst`
 * (so the pop particles match), and paints the chip in its own color when
 * active. Seeded reaction colors are hex; invalid or missing values fall back
 * to brand teal and lean on the `bg-brand-quiet` class for fill.
 */
function reactionChipStyle(
  accent: string,
  active: boolean,
  tone: 'chip' | 'picker' = 'chip',
): CSSProperties {
  const style = { '--lx-burst': accent } as CSSProperties
  if (active) {
    style.color = accent
    if (tone === 'chip') {
      style.borderColor = accent
    }
    if (HEX_COLOR_RE.test(accent)) {
      style.backgroundColor = `${accent}${tone === 'picker' ? '18' : '26'}`
    }
  }
  return style
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

        const accent = reactionAccent(config)
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
            style={reactionChipStyle(accent, active)}
            className={cn(
              'lx-reaction-chip relative inline-flex min-h-11 items-center gap-1.5 rounded-md border px-2 py-2 transition-colors',
              active
                ? cn(
                    'font-medium',
                    !HEX_COLOR_RE.test(accent) && 'bg-brand-quiet',
                  )
                : 'border-transparent bg-transparent text-text-faint hover:border-line hover:text-text',
              popReaction === reactionType && 'lx-reaction-pop',
            )}
          >
            <span aria-hidden="true" className="lx-reaction-emoji text-sm">
              {config.emoji}
            </span>
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
          align="center"
          side="top"
          sideOffset={8}
          collisionPadding={12}
          className="w-max max-w-[calc(100vw-2rem)] rounded-md border-line bg-surface p-1.5 shadow-floating"
        >
          <div
            data-testid="reaction-picker"
            className="inline-flex items-center gap-1"
          >
            {reactionConfigs.map((config) => {
              const reactionType = config.key
              const accent = reactionAccent(config)
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
                  style={reactionChipStyle(accent, active, 'picker')}
                  className={cn(
                    'lx-reaction-picker-item inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-transparent text-text-muted transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60',
                    active && !HEX_COLOR_RE.test(accent) && 'bg-brand-quiet',
                    popReaction === reactionType && 'lx-reaction-pop',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="lx-reaction-emoji text-lg"
                  >
                    {config.emoji}
                  </span>
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
