import { useCallback, useEffect, useState } from 'react'

/** Resolve a destination when its row mounts, including independently loaded replies. */
export function useCommentHighlight(
  targetId: string | null,
  onRelease?: (commentId: string) => void,
) {
  const [target, setTarget] = useState<{
    id: string
    element: HTMLElement
  } | null>(null)
  const registerCommentElement = useCallback(
    (id: string, element: HTMLElement | null) => {
      if (id !== targetId) return
      setTarget((current) =>
        current?.id === id && current.element === element
          ? current
          : element
            ? { id, element }
            : null,
      )
    },
    [targetId],
  )

  useEffect(() => {
    if (!targetId || target?.id !== targetId) return
    const reducedMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches
    target.element.scrollIntoView({
      behavior: reducedMotion ? 'instant' : 'smooth',
      block: 'center',
    })
    const timer = window.setTimeout(
      () => onRelease?.(targetId),
      reducedMotion ? 0 : 1800,
    )
    return () => window.clearTimeout(timer)
  }, [onRelease, target, targetId])

  return registerCommentElement
}
