import { Skeleton } from '@/components/ui/skeleton'

export const ROUTE_PENDING_MS = 150
export const ROUTE_PENDING_MIN_MS = 250

export function FeedRoutePending() {
  return (
    <div className="lx-page-shell">
      <span className="sr-only" role="status">
        loading feed
      </span>
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
      <span className="sr-only" role="status">
        loading form
      </span>
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
      <span className="sr-only" role="status">
        loading inbox
      </span>
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

export function ProjectRoutePending() {
  return (
    <div className="lx-page-shell">
      <span className="sr-only" role="status">
        loading project
      </span>
      <div className="shrink-0 border-b border-line px-(--lx-gutter) py-4">
        <div className="lx-page-width-detail flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-button" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="lx-page-scroll">
        <div className="lx-page-width-detail py-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-5">
              <section className="rounded-card border border-line bg-surface p-5 shadow-card">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <Skeleton className="h-14 w-14 shrink-0 rounded-avatar" />
                  <div className="min-w-0 flex-1 space-y-3">
                    <Skeleton className="h-6 w-4/5 max-w-96" />
                    <Skeleton className="h-4 w-2/3 max-w-80" />
                    <div className="flex flex-wrap gap-2">
                      <Skeleton className="h-7 w-24 rounded-pill" />
                      <Skeleton className="h-7 w-20 rounded-pill" />
                      <Skeleton className="h-7 w-28 rounded-pill" />
                    </div>
                  </div>
                </div>
                <div className="mt-5 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-11/12" />
                  <Skeleton className="h-4 w-3/5" />
                </div>
              </section>

              <section className="rounded-card border border-line bg-surface p-5 shadow-card">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-8 w-24 rounded-button" />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton
                      key={index}
                      className="h-20 rounded-card border border-line bg-canvas"
                    />
                  ))}
                </div>
              </section>

              <section className="rounded-card border border-line bg-surface p-5 shadow-card">
                <Skeleton className="h-5 w-24" />
                <div className="mt-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-16 rounded-card" />
                  ))}
                </div>
              </section>
            </div>

            <aside className="space-y-4">
              <Skeleton className="h-32 rounded-card border border-line bg-surface shadow-card" />
              <Skeleton className="h-40 rounded-card border border-line bg-surface shadow-card" />
              <Skeleton className="h-28 rounded-card border border-line bg-surface shadow-card" />
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ProfileRoutePending() {
  return (
    <div className="lx-page-shell">
      <span className="sr-only" role="status">
        loading profile
      </span>
      <div className="shrink-0 border-b border-line px-(--lx-gutter) py-4">
        <div className="lx-page-width-detail flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-button" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
      <div className="lx-page-scroll">
        <div className="lx-page-width-detail py-5">
          <div className="space-y-5">
            <section className="rounded-card border border-line bg-surface p-5 shadow-card">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <Skeleton className="h-16 w-16 shrink-0 rounded-avatar" />
                <div className="min-w-0 flex-1 space-y-3">
                  <Skeleton className="h-6 w-3/5 max-w-80" />
                  <Skeleton className="h-4 w-2/5 max-w-56" />
                  <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-7 w-24 rounded-pill" />
                    <Skeleton className="h-7 w-28 rounded-pill" />
                  </div>
                </div>
                <Skeleton className="h-10 w-28 rounded-button" />
              </div>
            </section>

            <div className="grid gap-4 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton
                  key={index}
                  className="h-24 rounded-card border border-line bg-surface shadow-card"
                />
              ))}
            </div>

            <section className="rounded-card border border-line bg-surface p-5 shadow-card">
              <Skeleton className="h-5 w-32" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-28 rounded-card" />
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
