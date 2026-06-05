import { useRouterState } from '@tanstack/react-router'

export function RouteNavigationProgress() {
  const isLoading = useRouterState({
    select: (state) => state.isLoading,
  })

  if (!isLoading) {
    return null
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-50"
      role="status"
    >
      <span className="sr-only">loading route</span>
      <div className="h-0.5 w-full overflow-hidden bg-transparent">
        <div className="h-full w-2/3 origin-left animate-pulse bg-brand motion-reduce:animate-none" />
      </div>
    </div>
  )
}
