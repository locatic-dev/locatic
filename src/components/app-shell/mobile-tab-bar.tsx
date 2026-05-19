import { Link, useRouterState } from '@tanstack/react-router'
import { Home, Compass, Inbox, User, Bell } from '@/lib/icons'
import type { ReactNode } from 'react'

interface TabItem {
  id: string
  label: string
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

  const tabs: TabItem[] = [
    { id: 'home', label: 'home', href: '/home', icon: <Home size={20} /> },
    {
      id: 'explore',
      label: 'explore',
      href: '/explore',
      icon: <Compass size={20} />,
    },
    {
      id: 'notifications',
      label: 'notifications',
      href: '/notifications',
      icon: <Bell size={20} />,
      badge: unreadNotifications,
    },
    {
      id: 'inbox',
      label: 'inbox',
      href: '/inbox',
      icon: <Inbox size={20} />,
      badge: unreadMessages,
    },
    {
      id: 'profile',
      label: 'profile',
      href: '/profile',
      icon: <User size={20} />,
    },
  ]

  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-50 flex min-h-(--lx-mobile-tab-height) items-start justify-around border-t border-line bg-canvas px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+4px)]"
    >
      {tabs.map((item) => {
        const isActive =
          currentPath === item.href || currentPath.startsWith(item.href + '/')
        return (
          <Link
            key={item.id}
            to={item.href}
            preload={false}
            aria-current={isActive ? 'page' : undefined}
            aria-label={item.label}
            className="relative flex min-h-11 flex-1 flex-col items-center justify-center gap-1 px-3 py-1.5 no-underline"
          >
            {isActive && (
              <div
                className="absolute -top-2 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-pill bg-brand"
                aria-hidden
              />
            )}
            <span
              className={
                isActive
                  ? 'relative flex text-brand'
                  : 'relative flex text-text-faint'
              }
            >
              {item.icon}
              {item.badge != null && item.badge > 0 && (
                <span
                  className="absolute -top-1 -right-1.5 h-2 w-2 rounded-full bg-brand"
                  aria-hidden
                />
              )}
            </span>
            <span
              className={
                isActive
                  ? 'font-mono text-[9.5px] text-text'
                  : 'font-mono text-[9.5px] text-text-faint'
              }
            >
              {item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
