export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'locatic.sidebar.collapsed'

export function parseStoredSidebarCollapsed(value: string | null) {
  return value === 'true'
}
