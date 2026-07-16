import {
  cloneElement,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
} from 'react'
import { Link } from '@tanstack/react-router'
import { usePaginatedQuery } from 'convex/react'

import { api } from '../../../../convex/_generated/api'
import { PersonRow } from '@/components/ui/person-row'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'

const OPEN_DELAY_MS = 250
const LONG_PRESS_MS = 450

export function ReactorInspector({
  children,
  count,
  emoji,
  label,
  targetId,
  targetType,
  reactionType,
}: {
  children: ReactElement<Record<string, unknown>>
  count: number
  emoji: string
  label: string
  targetId: string
  targetType: 'project' | 'post' | 'comment'
  reactionType: string
}) {
  const [open, setOpen] = useState(false)
  const openTimer = useRef<number | null>(null)
  const longPressTimer = useRef<number | null>(null)
  const suppressClick = useRef(false)
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

  const clearTimers = () => {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current)
    if (longPressTimer.current !== null)
      window.clearTimeout(longPressTimer.current)
    openTimer.current = null
    longPressTimer.current = null
  }

  const trigger = cloneElement(children, {
    onBlur: () => {
      clearTimers()
      openTimer.current = window.setTimeout(() => setOpen(false), 180)
    },
    onClick: (event: MouseEvent) => {
      if (suppressClick.current) {
        event.preventDefault()
        event.stopPropagation()
        suppressClick.current = false
        return
      }
      const onClick = children.props.onClick as
        | ((event: MouseEvent) => void)
        | undefined
      onClick?.(event)
    },
    onFocus: () => setOpen(true),
    onPointerDown: (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return
      clearTimers()
      longPressTimer.current = window.setTimeout(() => {
        suppressClick.current = true
        setOpen(true)
      }, LONG_PRESS_MS)
    },
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      clearTimers()
      openTimer.current = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS)
    },
    onPointerLeave: () => {
      clearTimers()
      openTimer.current = window.setTimeout(() => setOpen(false), 180)
    },
    onPointerUp: clearTimers,
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>{trigger}</PopoverAnchor>
      <PopoverContent
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={clearTimers}
        onPointerLeave={() => setOpen(false)}
        side="top"
        sideOffset={8}
        className="w-64 overflow-hidden border-line bg-surface p-0 shadow-floating"
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
                renderIdentity={(content, className) => (
                  <Link
                    to="/u/$username"
                    params={{ username: user.githubUsername }}
                    search={{ tab: 'projects' }}
                    className={className}
                  >
                    {content}
                  </Link>
                )}
                identityClassName="px-2 py-1 hover:bg-surface-alt"
              />
            ))
          )}
          {reactors.status === 'CanLoadMore' && (
            <button
              type="button"
              onClick={() => reactors.loadMore(12)}
              className="min-h-10 w-full rounded-md font-mono text-[11px] text-text-muted hover:bg-surface-alt hover:text-text"
            >
              load more
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export const ProjectReactorInspector = ReactorInspector
