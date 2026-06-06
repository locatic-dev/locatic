import { useEffect, useRef, useState } from 'react'

export function useDebouncedRouteSearch({
  delayMs = 250,
  onCommit,
  routeQuery,
}: {
  delayMs?: number
  onCommit: (query: string) => void
  routeQuery: string
}) {
  const [localSearchQuery, setLocalSearchQuery] = useState(routeQuery)
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(routeQuery)
  const routeSearchQueryRef = useRef(routeQuery)
  const locallyCommittedSearchQueryRef = useRef(routeQuery)

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const nextQuery = localSearchQuery.trim()
      setDebouncedSearchQuery(nextQuery)
      if (nextQuery !== routeSearchQueryRef.current) {
        locallyCommittedSearchQueryRef.current = nextQuery
        onCommit(nextQuery)
      }
    }, delayMs)

    return () => window.clearTimeout(timeout)
  }, [delayMs, localSearchQuery, onCommit])

  useEffect(() => {
    routeSearchQueryRef.current = routeQuery
    if (routeQuery === locallyCommittedSearchQueryRef.current) {
      return
    }

    locallyCommittedSearchQueryRef.current = routeQuery
    setLocalSearchQuery(routeQuery)
    setDebouncedSearchQuery(routeQuery)
  }, [routeQuery])

  const resetSearchQuery = () => {
    locallyCommittedSearchQueryRef.current = ''
    setLocalSearchQuery('')
    setDebouncedSearchQuery('')
  }

  return {
    debouncedSearchQuery,
    localSearchQuery,
    resetSearchQuery,
    setLocalSearchQuery,
  }
}
