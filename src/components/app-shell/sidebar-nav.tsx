import { Link, useRouterState } from '@tanstack/react-router'
import * as m from 'motion/react-m'
import { indicatorSpring } from '@/lib/motion'
import { formatUnreadCount, unreadNavLabel } from '@/lib/format'
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
import { useState, type ReactNode } from 'react'
import { AboutDialog } from '@/features/landing/about-dialog'
import { useResumeExploreSearch } from '@/features/explore/state'

interface NavItem {
  id: string
  label: string
  href: string
  icon: ReactNode
  badge?: number
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'home', href: '/home', icon: <Home size={16} /> },
  {
    id: 'explore',
    label: 'explore',
    href: '/explore',
    icon: <Compass size={16} />,
  },
  { id: 'inbox', label: 'inbox', href: '/inbox', icon: <Inbox size={16} /> },
  {
    id: 'notifications',
    label: 'notifications',
    href: '/notifications',
    icon: <Bell size={16} />,
  },
  {
    id: 'profile',
    label: 'profile',
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
  /** Adds the email campaigns link to the account menu. */
  isEmailAdmin?: boolean
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

export function SidebarNav({
  viewer,
  unreadNotifications,
  unreadMessages,
  isEmailAdmin = false,
  collapsed = false,
  onCollapsedChange,
}: SidebarNavProps) {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const resumeExploreSearch = useResumeExploreSearch(routerState.location.href)

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
          collapsed ? 'w-19' : 'w-(--lx-sidebar-width)'
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
                  <Logo size={20} />
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
              <Logo size={22} className="shrink-0" />
              <span className="text-title font-bold text-text">locatic</span>
            </div>
            <button
              type="button"
              onClick={() => onCollapsedChange?.(true)}
              className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent text-text-muted transition-colors hover:border-line hover:bg-surface hover:text-text"
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
                ? resumeExploreSearch
                : item.href === '/profile'
                  ? ({ tab: 'projects' } as const)
                  : item.href === '/inbox'
                    ? ({ tab: 'inbox' } as const)
                    : item.href === '/settings'
                      ? ({ tab: 'account' } as const)
                      : (true as const)

            const unreadCount = item.badge ?? 0

            const navLink = (
              <Link
                to={item.href}
                search={linkSearch}
                preload={false}
                aria-current={isActive ? 'page' : undefined}
                aria-label={unreadNavLabel(item.label, unreadCount)}
                className={[
                  'relative flex min-h-11 items-center rounded-md text-label no-underline transition-colors',
                  collapsed ? 'justify-center px-4 py-3' : 'gap-3 px-4 py-2.5',
                  collapsed ? 'mx-2' : 'mx-3',
                  isActive
                    ? 'text-text'
                    : 'text-text-muted hover:bg-surface-alt/60 hover:text-text',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span
                  className={
                    isActive ? 'flex text-brand' : 'flex text-text-muted'
                  }
                >
                  {item.icon}
                </span>
                {!collapsed && <span>{item.label}</span>}
                {unreadCount > 0 && (
                  <span
                    aria-hidden
                    className={`min-w-5 rounded-pill bg-surface-raised px-1.5 py-0.5 text-center font-mono text-meta leading-none text-text tabular-nums ${
                      collapsed ? 'absolute top-1 right-1' : 'ml-auto'
                    }`}
                  >
                    {formatUnreadCount(unreadCount)}
                  </span>
                )}
              </Link>
            )

            if (collapsed) {
              return (
                <Tooltip key={item.id}>
                  <div className="relative">
                    {isActive && (
                      <m.div
                        layoutId="sidebar-nav-active-bar"
                        className="lx-nav-active-bar"
                        transition={indicatorSpring}
                      />
                    )}
                    <TooltipTrigger asChild>{navLink}</TooltipTrigger>
                  </div>
                  <TooltipContent side="right" sideOffset={8}>
                    {item.label}
                    {unreadCount > 0 && ` (${formatUnreadCount(unreadCount)})`}
                  </TooltipContent>
                </Tooltip>
              )
            }

            return (
              <div key={item.id} className="relative">
                {isActive && (
                  <m.div
                    layoutId="sidebar-nav-active-bar"
                    className="lx-nav-active-bar"
                    transition={indicatorSpring}
                  />
                )}
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
                      className="flex min-h-11 min-w-11 items-center justify-center text-inherit no-underline"
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
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-inherit no-underline"
                >
                  <LxAvatar
                    name={viewer.githubUsername}
                    avatarUrl={viewer.avatarUrl}
                    size={28}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-sans text-label font-medium text-text">
                      {viewer.displayName || viewer.githubUsername}
                    </div>
                    {viewer.city && (
                      <div className="truncate font-mono text-meta text-text-muted">
                        {viewer.city}
                      </div>
                    )}
                  </div>
                </Link>
              )}

              {/* More icon — opens account menu */}
              <AccountMenu isEmailAdmin={isEmailAdmin} />
            </div>
          </div>
        )}
      </aside>
    </TooltipProvider>
  )
}

function AccountMenu({ isEmailAdmin }: { isEmailAdmin: boolean }) {
  const { signOut } = useClerk()
  const [aboutOpen, setAboutOpen] = useState(false)
  return (
    <>
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
          {isEmailAdmin ? (
            <DropdownMenuItem asChild>
              <Link
                to="/admin/emails"
                preload={false}
                className="text-inherit no-underline"
              >
                email campaigns
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onSelect={() => setAboutOpen(true)}
            className="cursor-pointer"
          >
            about
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
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </>
  )
}
