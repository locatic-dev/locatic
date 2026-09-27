import { Link, useRouterState } from '@tanstack/react-router'
import * as m from 'motion/react-m'
import { Home, Compass, Inbox, User, Bell } from '@/lib/icons'
import type { ReactNode } from 'react'
import { useResumeExploreSearch } from '@/features/explore/state'
import { indicatorSpring } from '@/lib/motion'
import { formatUnreadCount, unreadNavLabel } from '@/lib/format'

interface TabItem {
  id: string
  /** Accessible name; the unread count is appended to it. */
  label: string
  /** Visible caption, short enough for five tabs at 320px. */
  shortLabel: string
  href: string
  icon: ReactNode
  badge?: number
}

interface MobileTabBarProps {
  unreadNotifications?: number
  unreadMessages?: number
}

export function MobileTabBar({
  unreadNotifications,
  unreadMessages,
}: MobileTabBarProps) {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const resumeExploreSearch = useResumeExploreSearch(routerState.location.href)

  // Same order as the desktop sidebar so the two navigations never disagree.
  const tabs: TabItem[] = [
    {
      id: 'home',
      label: 'home',
      shortLabel: 'home',
      href: '/home',
      icon: <Home size={20} />,
    },
    {
      id: 'explore',
      label: 'explore',
      shortLabel: 'explore',
      href: '/explore',
      icon: <Compass size={20} />,
    },
    {
      id: 'inbox',
      label: 'inbox',
      shortLabel: 'inbox',
      href: '/inbox',
      icon: <Inbox size={20} />,
      badge: unreadMessages,
    },
    {
      id: 'notifications',
      label: 'notifications',
      shortLabel: 'alerts',
      href: '/notifications',
      icon: <Bell size={20} />,
      badge: unreadNotifications,
    },
    {
      id: 'profile',
      label: 'profile',
      shortLabel: 'profile',
      href: '/profile',
      icon: <User size={20} />,
    },
  ]

  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-50 flex min-h-(--lx-mobile-tab-height) items-start justify-around border-t border-line bg-surface-chrome px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+4px)]"
    >
      {tabs.map((item) => {
        const isActive =
          currentPath === item.href || currentPath.startsWith(item.href + '/')
        const unreadCount = item.badge ?? 0
        return (
          <Link
            key={item.id}
            to={item.href}
            search={item.href === '/explore' ? resumeExploreSearch : true}
            preload={false}
            aria-current={isActive ? 'page' : undefined}
            aria-label={unreadNavLabel(item.label, unreadCount)}
            className="relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md px-1.5 py-1.5 no-underline transition-transform duration-[140ms] ease-out active:scale-[0.97]"
          >
            {isActive && (
              <m.div
                layoutId="mobile-tab-active-indicator"
                className="absolute -top-2 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-pill bg-brand"
                transition={indicatorSpring}
                aria-hidden
              />
            )}
            <span
              className={
                isActive
                  ? 'relative flex text-brand'
                  : 'relative flex text-text-muted'
              }
            >
              {item.icon}
              {unreadCount > 0 && (
                <span
                  aria-hidden
                  className="absolute -top-2 -right-3 min-w-5 rounded-pill bg-surface-raised px-1 py-0.5 text-center font-mono text-meta leading-none text-text tabular-nums"
                >
                  {formatUnreadCount(unreadCount)}
                </span>
              )}
            </span>
            <span
              className={
                isActive
                  ? 'max-w-full truncate text-meta leading-none text-text'
                  : 'max-w-full truncate text-meta leading-none text-text-muted'
              }
            >
              {item.shortLabel}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
