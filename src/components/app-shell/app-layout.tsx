import { useEffect, useState, type ReactNode } from 'react'
import { SidebarNav } from './sidebar-nav'
import { MobileTabBar } from './mobile-tab-bar'
import { RouteNavigationProgress } from './route-navigation-progress'
import {
  parseStoredSidebarCollapsed,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
} from '@/lib/sidebar-layout'

interface AppLayoutProps {
  children: ReactNode
  viewer?: {
    displayName: string
    githubUsername: string
    avatarUrl?: string
    city?: string
  } | null
  rightRail?: ReactNode
  unreadNotifications?: number
  unreadMessages?: number
}

export function AppLayout({
  children,
  viewer,
  rightRail,
  unreadNotifications,
  unreadMessages,
}: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    setSidebarCollapsed(
      parseStoredSidebarCollapsed(
        window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY),
      ),
    )
  }, [])

  const handleSidebarCollapsedChange = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        SIDEBAR_COLLAPSED_STORAGE_KEY,
        String(collapsed),
      )
    }
  }

  return (
    <div className="min-h-dvh bg-background md:flex">
      <RouteNavigationProgress />

      {/* Desktop sidebar — hidden on mobile, sticky so it doesn't scroll with content */}
      <div className="sticky top-0 z-10 hidden h-dvh shrink-0 self-start md:flex">
        <SidebarNav
          viewer={viewer}
          unreadNotifications={unreadNotifications}
          unreadMessages={unreadMessages}
          collapsed={sidebarCollapsed}
          onCollapsedChange={handleSidebarCollapsedChange}
        />
      </div>

      {/* Main content area */}
      <main
        id="main-content"
        tabIndex={-1}
        className="lx-main-content flex min-h-dvh flex-1"
      >
        <div className="lx-page-shell lx-main-content w-full flex-1">
          {children}
        </div>

        {/* Right rail — desktop xl only */}
        {rightRail && (
          <aside className="hidden w-(--lx-right-rail-width) shrink-0 flex-col gap-7 overflow-auto border-l border-line bg-canvas p-6 xl:flex xl:min-h-dvh">
            {rightRail}
          </aside>
        )}
      </main>

      {/* Mobile bottom tab bar */}
      <div className="flex md:hidden">
        <MobileTabBar
          unreadNotifications={unreadNotifications}
          unreadMessages={unreadMessages}
        />
      </div>
    </div>
  )
}
