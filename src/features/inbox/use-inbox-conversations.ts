import { usePaginatedQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { mergeInboxPages } from './pagination'

const PAGE_SIZE = 30

export function useInboxConversations() {
  const [requestedCount, setRequestedCount] = useState(PAGE_SIZE)
  const low = usePaginatedQuery(
    api.conversations.listPage,
    { side: 'low' },
    { initialNumItems: PAGE_SIZE },
  )
  const high = usePaginatedQuery(
    api.conversations.listPage,
    { side: 'high' },
    { initialNumItems: PAGE_SIZE },
  )
  const sources = [low, high]
  const loading = sources.some((source) => source.status === 'LoadingFirstPage')
  const loadingMore = sources.some((source) => source.status === 'LoadingMore')
  return {
    ...mergeInboxPages(sources, requestedCount),
    loading,
    loadingMore,
    loadMore() {
      if (loading || loadingMore) return
      setRequestedCount((count) => count + PAGE_SIZE)
      for (const source of sources)
        if (source.status === 'CanLoadMore') source.loadMore(PAGE_SIZE)
    },
  }
}
