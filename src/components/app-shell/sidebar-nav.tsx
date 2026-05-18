import { Link, useRouterState } from '@tanstack/react-router'
import { Home, Compass, Inbox, User, Bell, MoreHorizontal } from '@/lib/icons'
import { Logo } from '@/components/ui/logo'
import { LxAvatar } from '@/components/ui/lx-avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useClerk } from '@clerk/tanstack-react-start'
import type { ReactNode } from 'react'

interface NavItem {
  id: string
  label: string
  href: string
  icon: ReactNode
  badge?: number
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', href: '/home', icon: <Home size={16} /> },
  {
    id: 'explore',
    label: 'Explore',
    href: '/explore',
    icon: <Compass size={16} />,
  },
  { id: 'inbox', label: 'Inbox', href: '/inbox', icon: <Inbox size={16} /> },
  {
    id: 'notifications',
    label: 'Notifications',
    href: '/notifications',
    icon: <Bell size={16} />,
  },
  {
    id: 'profile',
    label: 'Profile',
    href: '/profile',
    icon: <User size={16} />,
  },
]

interface SidebarNavProps {
  viewer?: {
    displayName: string
    githubUsername: string
    avatarUrl?: string
    city?: string
  } | null
  unreadNotifications?: number
  unreadMessages?: number
}

export function SidebarNav({
  viewer,
  unreadNotifications,
  unreadMessages,
}: SidebarNavProps) {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  const items = NAV_ITEMS.map((item) => ({
    ...item,
    badge:
      item.id === 'inbox'
        ? unreadMessages
        : item.id === 'notifications'
          ? unreadNotifications
          : undefined,
  }))

  return (
    <aside
      className="h-full"
      style={{
        width: 'var(--lx-sidebar-width)',
        height: '100%',
        borderRight: '1px solid var(--lx-border)',
        background: 'var(--lx-bg)',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 0 8px',
        flexShrink: 0,
        overflowY: 'auto',
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: '0 20px 28px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Logo size={22} />
        <span
          style={{
            fontFamily: 'var(--lx-font-mono)',
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--lx-text)',
            letterSpacing: '-0.02em',
          }}
        >
          locatic
        </span>
      </div>

      {/* Nav links */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map((item) => {
          const isActive =
            currentPath === item.href || currentPath.startsWith(item.href + '/')
          return (
            <div key={item.id} style={{ position: 'relative' }}>
              {isActive && <div className="lx-nav-active-bar" />}
              <Link
                to={item.href}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 20px',
                  color: isActive ? 'var(--lx-text)' : 'var(--lx-text-2)',
                  fontFamily: 'var(--lx-font-mono)',
                  fontSize: 13,
                  textDecoration: 'none',
                  transition: 'color 0.14s',
                }}
              >
                <span
                  style={{
                    color: isActive ? 'var(--lx-accent)' : 'var(--lx-text-3)',
                    display: 'flex',
                  }}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {item.badge != null && item.badge > 0 && (
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: 10,
                      fontFamily: 'var(--lx-font-mono)',
                      padding: '2px 6px',
                      borderRadius: 8,
                      background: 'var(--lx-surface-alt)',
                      color: 'var(--lx-text-2)',
                      minWidth: 18,
                      textAlign: 'center',
                      lineHeight: 1,
                    }}
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </Link>
            </div>
          )
        })}
      </nav>

      {/* User footer */}
      {viewer && (
        <div className="mt-auto px-4">
          <div className="flex items-center gap-2.5 border-t border-line py-2.5">
            {/* Avatar + name — navigates to profile */}
            <Link
              to="/profile"
              className="flex min-w-0 flex-1 items-center gap-2.5 text-inherit no-underline"
            >
              <LxAvatar
                name={viewer.githubUsername}
                avatarUrl={viewer.avatarUrl}
                size={28}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[12px] font-semibold text-text">
                  {viewer.displayName || viewer.githubUsername}
                </div>
                {viewer.city && (
                  <div className="truncate font-mono text-[10.5px] text-text-faint">
                    {viewer.city}
                  </div>
                )}
              </div>
            </Link>

            {/* More icon — opens account menu */}
            <AccountMenu />
          </div>
        </div>
      )}
    </aside>
  )
}

function AccountMenu() {
  const { signOut } = useClerk()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md border-0 bg-transparent p-0 text-text-muted transition-colors hover:bg-surface-alt hover:text-text"
          aria-label="Account menu"
          type="button"
        >
          <MoreHorizontal size={15} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={8}>
        <DropdownMenuItem asChild>
          <Link to="/profile" className="text-inherit no-underline">
            View profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings" className="text-inherit no-underline">
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => void signOut({ redirectUrl: '/' })}
          className="cursor-pointer text-destructive"
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
