import { Skeleton } from '@/components/ui/skeleton'

export function FeedRoutePending() {
  return (
    <div className="lx-page-shell">
      <div className="shrink-0 border-b border-line px-(--lx-gutter) py-4">
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="lx-page-scroll">
        <div className="lx-page-width-feed py-5">
          <div className="flex flex-col gap-3.5">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton
                key={index}
                className="h-36 rounded-card border border-line bg-surface"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function FormRoutePending() {
  return (
    <div className="lx-page-shell">
      <div className="shrink-0 border-b border-line px-(--lx-gutter) py-4">
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="lx-page-scroll flex-1">
        <div className="lx-page-width-form py-5">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-2/5" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function InboxRoutePending() {
  return (
    <div className="lx-page-shell min-h-0 overflow-hidden">
      <div className="shrink-0 border-b border-line px-(--lx-gutter) py-4">
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-full border-b border-line md:w-88 md:border-r md:border-b-0">
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-18 rounded-card" />
            ))}
          </div>
        </div>
        <div className="hidden min-h-0 flex-1 flex-col md:flex">
          <div className="border-b border-line px-(--lx-gutter) py-4">
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="flex flex-1 flex-col gap-3 p-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-3/4 rounded-card" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
