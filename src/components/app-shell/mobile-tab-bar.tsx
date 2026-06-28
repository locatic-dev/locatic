import { Link, useRouterState } from '@tanstack/react-router'
import { Home, Compass, Inbox, User, Bell } from '@/lib/icons'
import type { ReactNode } from 'react'
import { useResumeExploreSearch } from '@/features/explore/state'

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
  const resumeExploreSearch = useResumeExploreSearch(routerState.location.href)

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
      className="fixed inset-x-0 bottom-0 z-50 flex min-h-(--lx-mobile-tab-height) items-start justify-around border-t border-line bg-surface-chrome px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+4px)]"
    >
      {tabs.map((item) => {
        const isActive =
          currentPath === item.href || currentPath.startsWith(item.href + '/')
        return (
          <Link
            key={item.id}
            to={item.href}
            search={item.href === '/explore' ? resumeExploreSearch : true}
            preload={false}
            aria-current={isActive ? 'page' : undefined}
            aria-label={item.label}
            className="relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1.5 py-1.5 no-underline"
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
                  className="absolute -top-2 -right-3 min-w-4.5 rounded-pill bg-brand px-1 py-0.5 text-center font-mono text-[9px] leading-none text-brand-foreground"
                  aria-label={`${item.badge} unread ${item.label}`}
                >
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </span>
            <span
              className={
                isActive
                  ? 'sr-only min-[380px]:not-sr-only min-[380px]:max-w-full min-[380px]:truncate min-[380px]:whitespace-nowrap min-[380px]:font-mono min-[380px]:text-[9px] min-[380px]:leading-none min-[380px]:text-text'
                  : 'sr-only min-[380px]:not-sr-only min-[380px]:max-w-full min-[380px]:truncate min-[380px]:whitespace-nowrap min-[380px]:font-mono min-[380px]:text-[9px] min-[380px]:leading-none min-[380px]:text-text-faint'
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
