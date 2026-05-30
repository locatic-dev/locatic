import { useCallback, useState, useTransition } from 'react'

export function useCommentThreadState() {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [isTransitionPending, startTransition] = useTransition()

  const isExpanded = useCallback(
    (commentId: string) => expandedIds.has(commentId),
    [expandedIds],
  )

  const expand = useCallback((commentId: string) => {
    startTransition(() => {
      setExpandedIds((current) => {
        if (current.has(commentId)) {
          return current
        }

        const next = new Set(current)
        next.add(commentId)
        return next
      })
    })
  }, [])

  const toggle = useCallback((commentId: string) => {
    startTransition(() => {
      setExpandedIds((current) => {
        const next = new Set(current)
        if (next.has(commentId)) {
          next.delete(commentId)
        } else {
          next.add(commentId)
        }
        return next
      })
    })
  }, [])

  return {
    expand,
    expandedIds,
    isExpanded,
    isTransitionPending,
    toggle,
  }
}
