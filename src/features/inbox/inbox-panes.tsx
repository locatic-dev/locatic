import type { ReactNode } from 'react'

export function InboxPanes({
  view,
  listOnly = false,
  list,
  children,
}: {
  view: 'list' | 'thread'
  listOnly?: boolean
  list: ReactNode
  children: ReactNode
}) {
  return (
    <div
      data-mobile-view={view}
      className="@container/inbox flex min-h-0 min-w-0 flex-1"
    >
      <section
        aria-label="conversations"
        className={`min-h-0 w-full flex-col @3xl/inbox:flex ${
          listOnly
            ? '@3xl/inbox:flex-1'
            : '@3xl/inbox:w-88 @3xl/inbox:shrink-0 @3xl/inbox:border-r @3xl/inbox:border-line'
        } ${view === 'thread' ? 'hidden' : 'flex'}`}
      >
        {list}
      </section>
      <section
        aria-label="conversation"
        className={`min-h-0 min-w-0 flex-1 flex-col ${
          listOnly ? 'hidden' : '@3xl/inbox:flex'
        } ${view === 'list' ? 'hidden' : 'flex'}`}
      >
        {children}
      </section>
    </div>
  )
}
