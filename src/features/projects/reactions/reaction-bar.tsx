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
 * (so the pop particles match), and marks the viewer's own reaction with a
 * solid border and text in the reaction's color. No tinted fill: tints are
 * reserved for hover and selected backgrounds. Seeded reaction colors are
 * hex; invalid or missing values fall back to brand teal.
 */
function reactionChipStyle(accent: string, active: boolean): CSSProperties {
  const style = { '--lx-burst': accent } as CSSProperties
  if (active) {
    style.color = accent
    style.borderColor = accent
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
  const barRef = useRef<HTMLDivElement>(null)
  // Crossing zero swaps a chip between a single button and the counted
  // inspector pair, which unmounts the focused control. Remember which
  // reaction had focus so it can land on the new chip's action button.
  const restoreFocusToRef = useRef<string | null>(null)
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

  // Runs after every render: the target chip may be disabled while the
  // mutation is pending and only becomes focusable once it settles.
  useEffect(() => {
    const reactionType = restoreFocusToRef.current
    if (!reactionType) {
      return
    }
    const active = document.activeElement
    if (active && active !== document.body) {
      // Focus is still on a control (or the viewer moved on): nothing to do.
      restoreFocusToRef.current = null
      return
    }
    const target = [
      ...(barRef.current?.querySelectorAll<HTMLButtonElement>(
        '[data-reaction-action]',
      ) ?? []),
    ].find((button) => button.dataset.reactionAction === reactionType)
    if (target && !target.disabled) {
      restoreFocusToRef.current = null
      target.focus()
    }
  })

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
    const focused = document.activeElement
    restoreFocusToRef.current =
      focused instanceof HTMLElement &&
      focused.dataset.reactionAction === reactionType &&
      barRef.current?.contains(focused)
        ? reactionType
        : null
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
      ref={barRef}
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

        const actionDisabled =
          disabled || viewerReactionStateLoading || Boolean(pendingReaction)
        // Fade only what the viewer cannot use: the action half of a counted
        // pill (its count still opens the reactor list, so it keeps full
        // contrast) or the whole zero-count pill, which is only an action. A
        // pending mutation disables without fading, so the bar does not
        // flash on every tap.
        const actionFaded =
          (disabled || viewerReactionStateLoading) && 'opacity-60'
        const chipClassName = cn(
          'lx-reaction-chip relative inline-flex h-7 items-center rounded-full border transition-colors pointer-coarse:h-11',
          active
            ? 'font-medium'
            : 'border-line bg-transparent text-text-muted hover:border-line-strong hover:text-text',
          popReaction === reactionType && 'lx-reaction-pop',
        )
        const action = (
          <button
            type="button"
            onClick={() => void handleToggleReaction(reactionType)}
            disabled={actionDisabled}
            aria-label={`${active ? 'Remove' : 'Add'} ${config.label} reaction`}
            aria-pressed={active}
            data-reaction-action={reactionType}
            // pr-0.5 + the count's pl-0.5 match the single pill's gap-1, so
            // the chip does not widen when its count leaves zero. On coarse
            // pointers the part is a full 44px tall, overhanging the pill's
            // 1px border so the border does not shrink the target to 42px.
            className={cn(
              'inline-flex h-full items-center justify-center rounded-l-full pr-0.5 pl-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:h-11 pointer-coarse:min-w-11',
              actionFaded,
            )}
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
            data-reaction-action={reactionType}
            data-reaction-pill=""
            style={reactionChipStyle(accent, active)}
            className={cn(
              chipClassName,
              'justify-center gap-1 px-2 pointer-coarse:min-w-11',
              actionFaded,
            )}
          >
            <span aria-hidden="true" className="lx-reaction-emoji text-sm">
              {config.emoji}
            </span>
            {/* min-w-3.5 mirrors the counted pill's 24px count target, so
                the chip keeps its width when the count leaves zero. */}
            <span className="min-w-3.5 tabular-nums">{count}</span>
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
            className="inline-flex size-7 items-center justify-center rounded-full border border-line bg-transparent text-text-muted transition-colors hover:border-line-strong hover:text-text disabled:opacity-60 pointer-coarse:size-11"
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
                  style={reactionChipStyle(accent, active)}
                  className={cn(
                    'lx-reaction-picker-item inline-flex size-8 items-center justify-center rounded-control border border-transparent text-text-muted transition-colors hover:bg-surface-alt hover:text-text disabled:opacity-60 pointer-coarse:size-11',
                    popReaction === reactionType && 'lx-reaction-pop',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="lx-reaction-emoji text-base"
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
