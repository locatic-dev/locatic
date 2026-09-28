import { useRef } from 'react'
import * as m from 'motion/react-m'
import { useRevealActiveTab } from '@/components/app-shell/use-reveal-active-tab'
import { indicatorSpring } from '@/lib/motion'
import type { ProfileContentTab } from '@/features/profile/state'

export type ProfileContentTabItem = {
  id: ProfileContentTab
  label: string
  mobileLabel: string
  /** Null when the tab is private on this profile; zero and null show no badge. */
  count: number | null
}

export function ProfileContentTabs({
  activeTab,
  isRoutePending,
  onSelectTab,
  tabs,
}: {
  activeTab: ProfileContentTab
  isRoutePending: boolean
  onSelectTab: (tab: ProfileContentTab) => void
  tabs: readonly ProfileContentTabItem[]
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  useRevealActiveTab(rowRef, activeTab)

  return (
    <div className="border-b border-line">
      {/* One row on every width: tabs keep their natural width, grow to fill
          wide screens and scroll sideways on narrow ones. */}
      <div
        ref={rowRef}
        className="relative flex items-stretch overflow-x-auto overscroll-x-contain"
      >
        {tabs.map((tabItem) => {
          const isActive = activeTab === tabItem.id
          return (
            <button
              key={tabItem.id}
              onClick={() => onSelectTab(tabItem.id)}
              className={`relative inline-flex min-h-11 shrink-0 grow items-center justify-center gap-1 whitespace-nowrap px-3 py-3.5 text-center text-meta transition-colors sm:text-label ${
                isActive
                  ? 'font-semibold text-text'
                  : 'text-text-muted hover:text-text'
              }`}
              type="button"
              aria-current={isActive ? 'true' : undefined}
              aria-busy={isRoutePending && isActive}
            >
              <span className="sm:hidden">{tabItem.mobileLabel}</span>
              <span className="hidden sm:inline">{tabItem.label}</span>
              {tabItem.count ? (
                <span
                  className={`shrink-0 rounded-pill px-1.5 py-px text-meta leading-[1.3] ${
                    isActive
                      ? 'bg-selected text-text'
                      : 'bg-surface-alt text-text-faint'
                  }`}
                >
                  {tabItem.count}
                </span>
              ) : null}
              {isActive && (
                <m.div
                  layoutId="profile-content-tab-indicator"
                  transition={indicatorSpring}
                  className="absolute right-1.5 bottom-0 left-1.5 h-0.5 bg-brand sm:right-3 sm:left-3"
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
