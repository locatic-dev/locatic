import * as m from 'motion/react-m'
import { indicatorSpring } from '@/lib/motion'
import type { ProfileContentTab } from '@/features/profile/state'

export type ProfileContentTabItem = {
  id: ProfileContentTab
  label: string
  mobileLabel: string
  count: number
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
  return (
    <div className="border-b border-line">
      <div className="grid grid-cols-2 items-stretch gap-0 min-[520px]:grid-cols-3 lg:grid-cols-5">
        {tabs.map((tabItem) => {
          const isActive = activeTab === tabItem.id
          return (
            <button
              key={tabItem.id}
              onClick={() => onSelectTab(tabItem.id)}
              className={`relative inline-flex min-h-11 min-w-0 items-center justify-center gap-1 whitespace-nowrap px-2.5 py-3.5 text-center font-mono text-[11px] transition-colors sm:text-[12.5px] ${
                isActive
                  ? 'font-semibold text-text'
                  : 'text-text-muted hover:text-text'
              }`}
              type="button"
              aria-busy={isRoutePending && isActive}
            >
              <span className="min-w-0 truncate whitespace-nowrap">
                <span className="sm:hidden">{tabItem.mobileLabel}</span>
                <span className="hidden sm:inline">{tabItem.label}</span>
              </span>
              <span
                className={`shrink-0 rounded-pill px-1.5 py-px text-[10px] leading-[1.3] sm:text-[10.5px] ${
                  isActive
                    ? 'bg-selected text-text'
                    : 'bg-surface-alt text-text-faint'
                }`}
              >
                {tabItem.count}
              </span>
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
