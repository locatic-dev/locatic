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
      style={{
        display: 'flex',
        height: '100dvh',
        overflow: 'hidden',
        background: 'var(--lx-bg)',
      }}
    >
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden md:flex" style={{ height: '100%' }}>
        <SidebarNav
          viewer={viewer}
          unreadNotifications={unreadNotifications}
          unreadMessages={unreadMessages}
        />
      </div>

      {/* Main content area */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          {children}
        </div>

        {/* Right rail — desktop xl only */}
        {rightRail && (
          <aside
            className="hidden xl:flex"
            style={{
              width: 280,
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
