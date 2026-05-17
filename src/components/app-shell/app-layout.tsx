import type { ReactNode } from 'react'
import { SidebarNav } from './sidebar-nav'
import { MobileTabBar } from './mobile-tab-bar'

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
  return (
    <div
      className="min-h-dvh bg-background md:flex"
      style={{
        background: 'var(--lx-bg)',
      }}
    >
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden md:flex md:min-h-dvh">
        <SidebarNav
          viewer={viewer}
          unreadNotifications={unreadNotifications}
          unreadMessages={unreadMessages}
        />
      </div>

      {/* Main content area */}
      <main
        id="main-content"
        tabIndex={-1}
        className="lx-main-content flex min-h-dvh flex-1"
        style={{
          flex: 1,
        }}
      >
        <div
          className="lx-page-shell lx-main-content w-full"
          style={{
            flex: 1,
          }}
        >
          {children}
        </div>

        {/* Right rail — desktop xl only */}
        {rightRail && (
          <aside
            className="hidden xl:flex xl:min-h-dvh"
            style={{
              width: 'var(--lx-right-rail-width)',
              borderLeft: '1px solid var(--lx-border)',
              padding: '24px',
              background: 'var(--lx-bg)',
              flexDirection: 'column',
              gap: 28,
              overflow: 'auto',
              flexShrink: 0,
            }}
          >
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
