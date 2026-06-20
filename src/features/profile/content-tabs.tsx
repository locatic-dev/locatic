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
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            onClick={() => onSelectTab(tabItem.id)}
            className={`relative inline-flex min-h-11 min-w-0 items-center justify-center gap-1 px-1.5 py-3.5 text-center font-mono text-[11px] sm:text-[12.5px] ${
              activeTab === tabItem.id
                ? 'font-semibold text-text'
                : 'text-text-faint'
            }`}
            type="button"
            aria-busy={isRoutePending && activeTab === tabItem.id}
          >
            <span className="min-w-0 truncate">
              <span className="sm:hidden">{tabItem.mobileLabel}</span>
              <span className="hidden sm:inline">{tabItem.label}</span>
            </span>
            <span className="shrink-0 rounded-pill bg-surface-alt px-1.5 py-px text-[10px] leading-[1.3] text-text-faint sm:text-[10.5px]">
              {tabItem.count}
            </span>
            {activeTab === tabItem.id && (
              <div className="absolute right-1.5 bottom-0 left-1.5 h-0.5 bg-brand sm:right-3 sm:left-3" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
