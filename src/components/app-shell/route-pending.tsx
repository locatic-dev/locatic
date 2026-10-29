import { PageHeader } from '@/components/app-shell/page-header'
import { CardSheet } from '@/components/ui/card-sheet'
import { Logo } from '@/components/ui/logo'
import { Skeleton } from '@/components/ui/skeleton'
import { ProfileContentSkeleton } from '@/features/profile/content-skeleton'

export const ROUTE_PENDING_MS = 150
export const ROUTE_PENDING_MIN_MS = 250

/**
 * Quiet page frame: a band shaped like `PageHeader` over an empty content
 * region. It shows no list rows on purpose. List pages (home, explore) render
 * their own list skeleton, built from the loaded list's container and row
 * anatomy, as soon as they mount, so a pending frame never flashes a second,
 * differently shaped list before it.
 */
function QuietRoutePending({ label }: { label: string }) {
  return (
    <div className="lx-page-shell">
      <span className="sr-only" role="status">
        {label}
      </span>
      <div className="shrink-0 border-b border-line px-(--lx-gutter) py-4">
        <div className="flex h-7 items-center">
          <Skeleton className="h-5 w-28" />
        </div>
      </div>
    </div>
  )
}

/**
 * Content-region pending used while the Convex auth handshake completes. The
 * persistent shell frame (sidebar, main region, mobile nav) is already painted
 * around it and it cannot know which route is loading, so it stays quiet.
 */
export function ContentRoutePending() {
  return <QuietRoutePending label="loading" />
}

/**
 * How long the sign-out screen still holds before revealing the next page.
 * Its content fades in after `ROUTE_PENDING_MS`, so a fast sign-out shows a
 * plain canvas and never flashes text. Once the fade has started
 * (`visibleAt`), the content stays up for at least `ROUTE_PENDING_MIN_MS`.
 */
export function signOutHoldMs(visibleAt: number | null, now: number) {
  if (visibleAt === null) return 0
  return Math.max(0, ROUTE_PENDING_MIN_MS - (now - visibleAt))
}

/** A single responsive, announced transition while the session ends. */
export function SignOutPending({ onVisible }: { onVisible?: () => void }) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-dvh items-center justify-center bg-canvas px-6 text-text"
    >
      {/* The delay mirrors ROUTE_PENDING_MS; `animationstart` fires once it
          elapses. Opacity only, so it needs no reduced-motion override; the
          status is announced immediately. */}
      <div
        onAnimationStart={onVisible}
        className="flex animate-in flex-col items-center gap-3 fill-mode-both delay-150 duration-200 fade-in"
      >
        <Logo size={32} />
        <p role="status" className="font-mono text-body text-text-muted">
          signing out…
        </p>
      </div>
    </main>
  )
}

/** Route pending for list pages that render their own list skeleton. */
export function FeedRoutePending() {
  return <QuietRoutePending label="loading feed" />
}

/**
 * Mirrors a notification row: 36px avatar, one text line, a timestamp. The
 * notifications page also renders it while loading more rows.
 */
export function NotificationRowSkeleton() {
  return (
    <div className="flex items-start gap-3 px-3 py-3">
      <Skeleton className="size-9 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1">
        <div className="flex h-6 items-center">
          <Skeleton className="h-3.5 w-4/5 max-w-72" />
        </div>
        <div className="mt-1 flex h-4 items-center">
          <Skeleton className="h-2.5 w-16" />
        </div>
      </div>
    </div>
  )
}

/**
 * The notifications header renders for real (its h1 included); only the list
 * area is a skeleton, inside the same sheet the loaded rows use.
 */
export function NotificationsRoutePending() {
  return (
    <div className="lx-page-shell">
      <PageHeader title="notifications" />
      <div className="lx-page-scroll flex-1">
        <div className="lx-page-width-feed">
          <CardSheet role="status" aria-label="loading notifications">
            {Array.from({ length: 6 }, (_, index) => (
              <NotificationRowSkeleton key={index} />
            ))}
          </CardSheet>
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
        <div className="lx-page-width-form-left py-5">
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
          <Skeleton className="h-10 w-10 rounded-control" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="lx-page-scroll">
        <div className="lx-page-width-detail py-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-5">
              <section className="rounded-card border border-line bg-surface p-5 shadow-card">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
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
                  <Skeleton className="h-8 w-24 rounded-control" />
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

/**
 * Mirrors the profile page order: the identity header (64px
 * avatar, name, handle, location and status pills), bio, meta and actions,
 * then one pinned card, the recent-work list (the same content-list
 * skeleton the page shows while it loads), then the contribution graph.
 */
export function ProfileRoutePending() {
  return (
    <div className="lx-page-shell">
      <span className="sr-only" role="status">
        loading profile
      </span>
      <div className="lx-page-scroll flex-1">
        <div className="lx-page-width-profile flex flex-col gap-8">
          <div className="flex flex-col gap-4 border-b border-line pb-6">
            <div className="flex min-w-0 items-start gap-4">
              <Skeleton className="size-16 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-8 w-3/5 max-w-64" />
                <Skeleton className="mt-2 h-3 w-28" />
                <div className="mt-2 flex items-center gap-2">
                  <Skeleton className="h-7 w-32 rounded-pill" />
                  <Skeleton className="h-7 w-24 rounded-pill" />
                </div>
              </div>
            </div>
            <div className="flex max-w-prose flex-col gap-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-4/5" />
            </div>
            <div className="flex min-h-11 items-center gap-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-11 w-28 rounded-control" />
              <Skeleton className="h-11 w-28 rounded-control" />
            </div>
          </div>

          <div>
            <div className="mb-3 flex h-5 items-center">
              <Skeleton className="h-3.5 w-16" />
            </div>
            <div className="rounded-card border border-line bg-surface px-4 py-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-14" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-4/5" />
            </div>
          </div>

          <div>
            <div className="mb-3 flex flex-col gap-1">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-2.5 w-40" />
            </div>
            {/* The page announces "loading profile" once; the reused list
                skeleton's own status stays out of the accessibility tree. */}
            <div aria-hidden="true">
              <ProfileContentSkeleton />
            </div>
          </div>

          <div>
            <div className="mb-3 flex h-5 items-center">
              <Skeleton className="h-3.5 w-40" />
            </div>
            <Skeleton className="h-28 rounded-card" />
          </div>
        </div>
      </div>
    </div>
  )
}
