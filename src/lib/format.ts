export function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

/**
 * Unread badge text. Counts past 99 read "99+": `notifications.unreadCount`
 * stops counting at 100, so a larger exact number is not known.
 */
export function formatUnreadCount(count: number): string {
  return count > 99 ? '99+' : String(count)
}

/** Accessible name for a nav link with an unread badge. */
export function unreadNavLabel(label: string, count: number): string {
  return count > 0 ? `${label}, ${formatUnreadCount(count)} unread` : label
}
