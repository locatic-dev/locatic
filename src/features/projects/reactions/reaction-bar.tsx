import { useQuery } from 'convex/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

import { api } from '../../../../convex/_generated/api'
import { reportActionError } from '@/lib/action-error'
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
import { ReactorInspector } from './project-reactor-inspector'

type ReactionTargetType = 'project' | 'post' | 'comment'

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
  pinnedReactionTypes: string[] = [],
) {
  const configuredTypes = reactionConfigs.flatMap((config) =>
    config.key ? [config.key] : [],
  )
  const visibleTypes = new Set([
    ...configuredTypes.filter((type) => (reactionCounts[type] ?? 0) > 0),
    ...viewerReactionTypes,
    ...pinnedReactionTypes,
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
  viewerReactionTypes?: string[]
}) {
  const configs = useQuery(api.reactions.listConfig, { targetType })
  const reactToTarget = useReactToTarget()
  const unreactFromTarget = useUnreactFromTarget()
  const [open, setOpen] = useState(false)
  const [pendingReaction, setPendingReaction] = useState<PendingReaction>(null)
  const [confirmedViewerReactionTypes, setConfirmedViewerReactionTypes] =
    useState(viewerReactionTypes ?? [])
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
  const effectiveViewerReactionTypes = confirmedViewerReactionTypes
  const viewerReactionStateLoading = viewerReactionTypes === undefined
  // A project's like chip is always shown, so it is the one like affordance
  // and the picker leaves it out.
  const pinnedReactionTypes = targetType === 'project' ? ['like'] : []
  const pickerReactionConfigs = reactionConfigs.filter(
    (config) => !pinnedReactionTypes.includes(config.key),
  )
  const visibleReactionTypes = getVisibleReactionTypes(
    reactionConfigs,
    reactionCounts,
    effectiveViewerReactionTypes,
    pinnedReactionTypes,
  )

  useEffect(() => {
    if (viewerReactionTypes !== undefined) {
      setConfirmedViewerReactionTypes(viewerReactionTypes)
    }
  }, [viewerReactionTypes])

  useEffect(
    () => () => {
      for (const timer of animationTimersRef.current) {
        window.clearTimeout(timer)
      }
      animationTimersRef.current = []
    },
    [],
  )

  // Takes the intended end state rather than toggling, so a retry re-applies
  // the same change; both mutations are idempotent on the server.
  const commitReaction = async (reactionType: string, nextActive: boolean) => {
    if (disabled || pendingReaction) {
      return
    }

    for (const timer of animationTimersRef.current) {
      window.clearTimeout(timer)
    }
    animationTimersRef.current = []
    setPendingReaction({ reactionType, nextActive })
    setBurstReaction(reactionType)
    setPopReaction(reactionType)
    animationTimersRef.current = [
      window.setTimeout(() => setBurstReaction(null), 460),
      window.setTimeout(() => setPopReaction(null), 260),
    ]

    try {
      if (nextActive) {
        await reactToTarget({
          reactionType,
          targetId,
          targetType,
        })
      } else {
        await unreactFromTarget({
          reactionType,
          targetId,
          targetType,
        })
      }
      setConfirmedViewerReactionTypes((current) =>
        nextActive
          ? [...new Set([...current, reactionType])]
          : current.filter((type) => type !== reactionType),
      )
      setOpen(false)
    } catch (error) {
      reportActionError(error, {
        title: nextActive
          ? "couldn't add your reaction"
          : "couldn't remove your reaction",
        retry: () => commitReaction(reactionType, nextActive),
      })
    } finally {
      setPendingReaction(null)
    }
  }

  const handleToggleReaction = (reactionType: string) =>
    commitReaction(
      reactionType,
      !effectiveViewerReactionTypes.includes(reactionType),
    )

  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-1.5 font-mono text-label',
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
          viewerReactionTypes: effectiveViewerReactionTypes,
        })

        if (
          count <= 0 &&
          !active &&
          !(targetType === 'project' && reactionType === 'like')
        ) {
          return null
        }

        const chipClassName = cn(
          'lx-reaction-chip relative inline-flex min-h-11 items-center rounded-md border transition-colors',
          active
            ? cn('font-medium', !HEX_COLOR_RE.test(accent) && 'bg-brand-quiet')
            : 'border-transparent bg-transparent text-text-faint hover:border-line hover:text-text',
          popReaction === reactionType && 'lx-reaction-pop',
        )
        const actionDisabled =
          disabled || viewerReactionStateLoading || Boolean(pendingReaction)
        const action = (
          <button
            type="button"
            onClick={() => void handleToggleReaction(reactionType)}
            disabled={actionDisabled}
            aria-label={`${active ? 'Remove' : 'Add'} ${config.label} reaction`}
            aria-pressed={active}
            className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
          >
            <span aria-hidden="true" className="lx-reaction-emoji text-sm">
              {config.emoji}
            </span>
            {burstReaction === reactionType && (
              <span aria-hidden="true" className="lx-reaction-burst">
                <span />
                <span />
                <span />
              </span>
            )}
          </button>
        )

        return count > 0 ? (
          <ReactorInspector
            key={reactionType}
            action={action}
            className={chipClassName}
            style={reactionChipStyle(accent, active)}
            targetId={targetId}
            targetType={targetType}
            reactionType={reactionType}
            emoji={config.emoji}
            label={config.label}
            count={count}
          />
        ) : (
          <button
            key={reactionType}
            type="button"
            onClick={() => void handleToggleReaction(reactionType)}
            disabled={actionDisabled}
            aria-label={`${active ? 'Remove' : 'Add'} ${config.label} reaction`}
            aria-pressed={active}
            style={reactionChipStyle(accent, active)}
            className={cn(
              chipClassName,
              'min-w-11 justify-center gap-1.5 px-2 py-2',
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
            disabled={
              disabled ||
              viewerReactionStateLoading ||
              pickerReactionConfigs.length === 0
            }
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
          collisionPadding={16}
          className="w-max max-w-[calc(100vw-2rem)] rounded-md border-line bg-surface p-1.5 shadow-floating"
        >
          <div
            data-testid="reaction-picker"
            className="inline-flex items-center gap-1"
          >
            {pickerReactionConfigs.map((config) => {
              const reactionType = config.key
              const accent = reactionAccent(config)
              const { active } = getOptimisticReactionState({
                pendingReaction,
                reactionCounts,
                reactionType,
                viewerReactionTypes: effectiveViewerReactionTypes,
              })

              return (
                <button
                  key={reactionType}
                  type="button"
                  onClick={() => void handleToggleReaction(reactionType)}
                  disabled={
                    disabled ||
                    viewerReactionStateLoading ||
                    Boolean(pendingReaction)
                  }
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
