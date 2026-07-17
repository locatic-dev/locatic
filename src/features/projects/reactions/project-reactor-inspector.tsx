import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
} from 'react'
import { Link } from '@tanstack/react-router'
import { usePaginatedQuery } from 'convex/react'

import { api } from '../../../../convex/_generated/api'
import { PersonRow } from '@/components/ui/person-row'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const OPEN_DELAY_MS = 250
const CLOSE_DELAY_MS = 180
const LONG_PRESS_MS = 450
const CLICK_SUPPRESSION_TIMEOUT_MS = 1_000

type InspectorActionProps = {
  onClick?: (event: MouseEvent<HTMLElement>) => void
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void
  onLostPointerCapture?: (event: PointerEvent<HTMLElement>) => void
  onPointerCancel?: (event: PointerEvent<HTMLElement>) => void
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void
  onPointerUp?: (event: PointerEvent<HTMLElement>) => void
}

type OpenReason = 'focus' | 'hover' | 'long-press' | 'trigger'

export function ReactorInspector({
  action,
  className,
  count,
  emoji,
  label,
  reactionType,
  style,
  targetId,
  targetType,
}: {
  action: ReactElement<InspectorActionProps>
  className?: string
  count: number
  emoji: string
  label: string
  reactionType: string
  style?: React.CSSProperties
  targetId: string
  targetType: 'project' | 'post' | 'comment'
}) {
  const [open, setOpen] = useState(false)
  const contentId = useId()
  const openTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  const longPressTimer = useRef<number | null>(null)
  const clickSuppressionTimer = useRef<number | null>(null)
  const suppressClick = useRef(false)
  const longPressActivated = useRef(false)
  const triggerElement = useRef<HTMLButtonElement | null>(null)
  const contentElement = useRef<HTMLDivElement | null>(null)
  const anchorHovered = useRef(false)
  const contentHovered = useRef(false)
  const openReason = useRef<OpenReason>('hover')
  const restoreFocusAfterClose = useRef(false)
  const reactors = usePaginatedQuery(
    api.reactions.listReactors,
    open
      ? {
          targetId,
          targetType,
          reactionType,
        }
      : 'skip',
    { initialNumItems: 12 },
  )

  const clearOpenTimer = () => {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current)
    openTimer.current = null
  }

  const clearCloseTimer = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    closeTimer.current = null
  }

  const clearLongPressTimer = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const clearClickSuppression = () => {
    if (clickSuppressionTimer.current !== null) {
      window.clearTimeout(clickSuppressionTimer.current)
      clickSuppressionTimer.current = null
    }
    suppressClick.current = false
    longPressActivated.current = false
  }

  const clearTimers = () => {
    clearOpenTimer()
    clearCloseTimer()
    clearLongPressTimer()
    if (clickSuppressionTimer.current !== null) {
      window.clearTimeout(clickSuppressionTimer.current)
      clickSuppressionTimer.current = null
    }
  }

  const isInsideInspector = (target: EventTarget | null) =>
    target instanceof Node &&
    (triggerElement.current
      ?.closest('[data-reactor-inspector]')
      ?.contains(target) === true ||
      contentElement.current?.contains(target) === true)

  const scheduleOpen = (reason: OpenReason) => {
    clearOpenTimer()
    clearCloseTimer()
    openTimer.current = window.setTimeout(() => {
      openReason.current = reason
      setOpen(true)
      openTimer.current = null
    }, OPEN_DELAY_MS)
  }

  const scheduleClose = () => {
    clearCloseTimer()
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      if (
        anchorHovered.current ||
        contentHovered.current ||
        isInsideInspector(document.activeElement)
      ) {
        return
      }
      setOpen(false)
    }, CLOSE_DELAY_MS)
  }

  const focusFirstContentControl = () => {
    const firstControl = contentElement.current?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    firstControl?.focus()
  }

  useEffect(
    () => () => {
      clearTimers()
      clearClickSuppression()
    },
    [],
  )

  const actionWithLongPress = cloneElement(action, {
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (suppressClick.current) {
        event.preventDefault()
        event.stopPropagation()
        clearClickSuppression()
        return
      }
      action.props.onClick?.(event)
    },
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      action.props.onContextMenu?.(event)
      if (!longPressActivated.current) return
      event.preventDefault()
    },
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) => {
      action.props.onLostPointerCapture?.(event)
      clearLongPressTimer()
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      action.props.onPointerCancel?.(event)
      clearLongPressTimer()
    },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      action.props.onPointerDown?.(event)
      if (event.pointerType !== 'touch') return
      clearOpenTimer()
      clearCloseTimer()
      clearLongPressTimer()
      longPressTimer.current = window.setTimeout(() => {
        longPressActivated.current = true
        suppressClick.current = true
        openReason.current = 'long-press'
        setOpen(true)
        clickSuppressionTimer.current = window.setTimeout(
          clearClickSuppression,
          CLICK_SUPPRESSION_TIMEOUT_MS,
        )
      }, LONG_PRESS_MS)
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      action.props.onPointerUp?.(event)
      clearLongPressTimer()
    },
  })

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        clearOpenTimer()
        clearCloseTimer()
        setOpen(nextOpen)
      }}
    >
      <PopoverAnchor asChild>
        <span
          data-reactor-inspector=""
          style={style}
          className={cn('relative inline-flex min-h-11', className)}
          onBlur={(event: FocusEvent<HTMLElement>) => {
            if (isInsideInspector(event.relatedTarget)) {
              clearCloseTimer()
              return
            }
            scheduleClose()
          }}
          onFocus={(event: FocusEvent<HTMLElement>) => {
            if (event.target === triggerElement.current && !open) {
              scheduleOpen('focus')
            }
          }}
          onPointerEnter={(event: PointerEvent<HTMLElement>) => {
            if (event.pointerType === 'touch') return
            anchorHovered.current = true
            scheduleOpen('hover')
          }}
          onPointerLeave={(event: PointerEvent<HTMLElement>) => {
            if (event.pointerType === 'touch') return
            anchorHovered.current = false
            scheduleClose()
          }}
        >
          {actionWithLongPress}
          <PopoverTrigger asChild>
            <button
              ref={triggerElement}
              type="button"
              aria-controls={contentId}
              aria-label={`View ${count} ${label} ${count === 1 ? 'reaction' : 'reactions'}`}
              onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                if (event.key === 'Escape' && open) {
                  restoreFocusAfterClose.current = true
                  return
                }
                if (event.key === 'Tab' && !event.shiftKey && open) {
                  event.preventDefault()
                  focusFirstContentControl()
                  return
                }
                if (event.key === 'Enter' || event.key === ' ') {
                  openReason.current = 'trigger'
                  clearOpenTimer()
                }
              }}
              onPointerDown={() => {
                openReason.current = 'trigger'
                clearOpenTimer()
              }}
              className="inline-flex min-h-11 items-center px-2 font-mono tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {count}
            </button>
          </PopoverTrigger>
        </span>
      </PopoverAnchor>
      <PopoverContent
        ref={contentElement}
        id={contentId}
        onBlurCapture={(event) => {
          if (isInsideInspector(event.relatedTarget)) {
            clearCloseTimer()
            return
          }
          scheduleClose()
        }}
        onCloseAutoFocus={(event) => {
          if (restoreFocusAfterClose.current) {
            restoreFocusAfterClose.current = false
            return
          }
          event.preventDefault()
        }}
        onEscapeKeyDown={() => {
          restoreFocusAfterClose.current = true
          clearOpenTimer()
          clearCloseTimer()
        }}
        onFocusCapture={clearCloseTimer}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          if (openReason.current === 'trigger') {
            window.queueMicrotask(focusFirstContentControl)
          }
        }}
        onKeyDownCapture={(event) => {
          if (
            event.key === 'Tab' &&
            event.shiftKey &&
            document.activeElement ===
              contentElement.current?.querySelector<HTMLElement>(
                'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
              )
          ) {
            event.preventDefault()
            triggerElement.current?.focus()
          }
        }}
        onPointerEnter={() => {
          contentHovered.current = true
          clearCloseTimer()
        }}
        onPointerLeave={() => {
          contentHovered.current = false
          scheduleClose()
        }}
        side="top"
        sideOffset={8}
        className="w-64 max-w-[calc(100vw-2rem)] overflow-hidden border-line bg-surface p-0 shadow-floating"
      >
        <div className="border-b border-line px-3 py-2.5 font-mono text-[12px] text-text">
          <span aria-hidden="true" className="mr-1.5">
            {emoji}
          </span>
          {label} · {count}
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {reactors.status === 'LoadingFirstPage' ? (
            <div className="px-2 py-3 font-mono text-[11px] text-text-muted">
              loading…
            </div>
          ) : (
            reactors.results.map((user) => (
              <PersonRow
                key={String(user.userId)}
                avatarName={user.displayName}
                avatarUrl={user.avatarUrl}
                size={30}
                title={user.displayName}
                meta={`@${user.githubUsername}`}
                renderIdentity={(content, identityClassName) => (
                  <Link
                    to="/u/$username"
                    params={{ username: user.githubUsername }}
                    search={{ tab: 'projects' }}
                    onClick={() => setOpen(false)}
                    className={identityClassName}
                  >
                    {content}
                  </Link>
                )}
                identityClassName="min-h-11 px-2 py-1 hover:bg-surface-alt"
              />
            ))
          )}
          {reactors.status === 'CanLoadMore' && (
            <button
              type="button"
              onClick={() => reactors.loadMore(12)}
              className="min-h-11 w-full rounded-md font-mono text-[11px] text-text-muted hover:bg-surface-alt hover:text-text"
            >
              load more
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
