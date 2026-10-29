type OrderedConversation = {
  _id: string
  _creationTime: number
  updatedAt: number
}

/** Each unfinished stream must cover the displayed prefix, even if it is all newer. */
export function mergeInboxPages<T extends OrderedConversation>(
  sources: Array<{ results: T[]; status: string }>,
  requestedCount: number,
) {
  const safeCount = Math.min(
    requestedCount,
    ...sources
      .filter((source) => source.status !== 'Exhausted')
      .map((source) => source.results.length),
  )
  const loaded = sources
    .flatMap((source) => source.results)
    .sort(
      (a, b) =>
        b.updatedAt - a.updatedAt ||
        b._creationTime - a._creationTime ||
        a._id.localeCompare(b._id),
    )
  const items = loaded.slice(0, safeCount)
  return {
    items,
    hasMore:
      sources.some((source) => source.status !== 'Exhausted') ||
      loaded.length > items.length,
  }
}
