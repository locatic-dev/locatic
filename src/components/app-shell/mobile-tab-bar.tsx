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
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 64,
        background: 'var(--lx-bg)',
        borderTop: '1px solid var(--lx-border)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-around',
        padding: '8px 8px 0',
        zIndex: 50,
      }}
    >
      {tabs.map((item) => {
        const isActive =
          currentPath === item.href || currentPath.startsWith(item.href + '/')
        return (
          <Link
            key={item.id}
            to={item.href}
            aria-current={isActive ? 'page' : undefined}
            aria-label={item.label}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '4px 12px',
              position: 'relative',
              flex: 1,
              textDecoration: 'none',
            }}
          >
            {isActive && (
              <div
                style={{
                  position: 'absolute',
                  top: -8,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 24,
                  height: 2,
                  background: 'var(--lx-accent)',
                  borderRadius: 1,
                }}
                aria-hidden
              />
            )}
            <span
              style={{
                position: 'relative',
                color: isActive ? 'var(--lx-accent)' : 'var(--lx-text-3)',
                display: 'flex',
              }}
            >
              {item.icon}
              {item.badge != null && item.badge > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -6,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--lx-accent)',
                  }}
                  aria-hidden
                />
              )}
            </span>
            <span
              style={{
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 9.5,
                color: isActive ? 'var(--lx-text)' : 'var(--lx-text-3)',
              }}
            >
              {item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
