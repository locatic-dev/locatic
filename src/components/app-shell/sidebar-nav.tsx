import { Link, useRouterState } from '@tanstack/react-router'
import {
  Home,
  Compass,
  Inbox,
  User,
  Bell,
  MoreHorizontal,
  ChevronLeft,
} from '@/lib/icons'
import { Logo } from '@/components/ui/logo'
import { LxAvatar } from '@/components/ui/lx-avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useClerk } from '@clerk/tanstack-react-start'
import type { ReactNode } from 'react'
import { getFreshExploreSearch } from '@/features/explore/state'

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
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

export function SidebarNav({
  viewer,
  unreadNotifications,
  unreadMessages,
  collapsed = false,
  onCollapsedChange,
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
    <TooltipProvider delayDuration={300}>
      <aside
        className={`flex h-full shrink-0 flex-col overflow-y-auto border-r border-line bg-surface-chrome px-0 pt-5 pb-2 transition-[width] duration-200 ${
          collapsed ? 'w-[76px]' : 'w-(--lx-sidebar-width)'
        }`}
      >
        {/* Logo / brand header */}
        {collapsed ? (
          <div className="flex justify-center px-2 pb-7">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onCollapsedChange?.(false)}
                  className="flex size-11 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent text-text transition-colors hover:bg-surface"
                  aria-label="Expand sidebar"
                  aria-expanded={false}
                >
                  <Logo size={20} inline className="text-brand" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Expand sidebar
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-5 pb-7">
            <div className="flex min-w-0 items-center gap-2.5">
              <Logo size={22} inline className="shrink-0 text-brand" />
              <span className="font-mono text-[15px] font-bold tracking-[-0.02em] text-text">
                locatic
              </span>
            </div>
            <button
              type="button"
              onClick={() => onCollapsedChange?.(true)}
              className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent text-text-faint transition-colors hover:border-line hover:bg-surface hover:text-text"
              aria-label="Collapse sidebar"
              aria-expanded={true}
              title="Collapse sidebar"
            >
              <ChevronLeft size={13} />
            </button>
          </div>
        )}

        {/* Nav links */}
        <nav className="flex flex-col gap-0.5">
          {items.map((item) => {
            const isActive =
              currentPath === item.href ||
              currentPath.startsWith(item.href + '/')

            const linkSearch =
              item.href === '/explore'
                ? getFreshExploreSearch()
                : item.href === '/profile'
                  ? ({ tab: 'projects' } as const)
                  : item.href === '/inbox'
                    ? ({ tab: 'inbox' } as const)
                    : item.href === '/settings'
                      ? ({ tab: 'account' } as const)
                      : (true as const)

            const navLink = (
              <Link
                to={item.href}
                search={linkSearch}
                preload={false}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.label}
                className={[
                  'relative flex items-center font-mono text-[13px] no-underline transition-colors',
                  collapsed ? 'justify-center px-4 py-2.5' : 'gap-3 px-5 py-2',
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
                {!collapsed && <span>{item.label}</span>}
                {item.badge != null && item.badge > 0 && (
                  <span
                    className={`min-w-4.5 rounded-pill bg-surface-alt px-1.5 py-0.5 text-center font-mono text-[10px] leading-none text-text-muted ${
                      collapsed ? 'absolute top-1 right-1' : 'ml-auto'
                    }`}
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </Link>
            )

            if (collapsed) {
              return (
                <Tooltip key={item.id}>
                  <div className="relative">
                    {isActive && <div className="lx-nav-active-bar" />}
                    <TooltipTrigger asChild>{navLink}</TooltipTrigger>
                  </div>
                  <TooltipContent side="right" sideOffset={8}>
                    {item.label}
                    {item.badge != null &&
                      item.badge > 0 &&
                      ` (${item.badge > 99 ? '99+' : item.badge})`}
                  </TooltipContent>
                </Tooltip>
              )
            }

            return (
              <div key={item.id} className="relative">
                {isActive && <div className="lx-nav-active-bar" />}
                {navLink}
              </div>
            )
          })}
        </nav>

        {/* User footer */}
        {viewer && (
          <div className={`mt-auto ${collapsed ? 'px-3' : 'px-4'}`}>
            <div
              className={`border-t border-line py-2.5 ${
                collapsed
                  ? 'flex flex-col items-center gap-2'
                  : 'flex items-center gap-2.5'
              }`}
            >
              {/* Avatar + name — navigates to profile */}
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to="/profile"
                      search={{ tab: 'projects' }}
                      preload={false}
                      aria-label="View profile"
                      className="flex justify-center text-inherit no-underline"
                    >
                      <LxAvatar
                        name={viewer.githubUsername}
                        avatarUrl={viewer.avatarUrl}
                        size={28}
                      />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {viewer.displayName || viewer.githubUsername}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Link
                  to="/profile"
                  search={{ tab: 'projects' }}
                  preload={false}
                  aria-label="View profile"
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
              )}

              {/* More icon — opens account menu */}
              <AccountMenu />
            </div>
          </div>
        )}
      </aside>
    </TooltipProvider>
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
          <Link
            to="/settings"
            search={{ tab: 'account' }}
            preload={false}
            className="text-inherit no-underline"
          >
            settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => void signOut({ redirectUrl: '/' })}
          className="cursor-pointer text-danger"
        >
          sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
