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
    <aside className="flex h-full w-(--lx-sidebar-width) shrink-0 flex-col overflow-y-auto border-r border-line bg-canvas px-0 pt-5 pb-2">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 pb-7">
        <Logo size={22} />
        <span className="font-mono text-[15px] font-bold tracking-[-0.02em] text-text">
          locatic
        </span>
      </div>

      {/* Nav links */}
      <nav className="flex flex-col gap-0.5">
        {items.map((item) => {
          const isActive =
            currentPath === item.href || currentPath.startsWith(item.href + '/')
          return (
            <div key={item.id} className="relative">
              {isActive && <div className="lx-nav-active-bar" />}
              <Link
                to={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={[
                  'flex items-center gap-3 px-5 py-2 font-mono text-[13px] no-underline transition-colors',
                  isActive ? 'text-text' : 'text-text-muted hover:text-text',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span
                  className={
                    isActive ? 'flex text-brand' : 'flex text-text-faint'
                  }
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {item.badge != null && item.badge > 0 && (
                  <span className="ml-auto min-w-4.5 rounded-pill bg-surface-alt px-1.5 py-0.5 text-center font-mono text-[10px] leading-none text-text-muted">
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
