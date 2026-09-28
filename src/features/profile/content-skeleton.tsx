import { Skeleton } from '@/components/ui/skeleton'

export function ProfileContentSkeleton() {
  return (
    <div
      role="status"
      className="flex flex-col gap-3.5"
      aria-label="loading content"
      aria-busy="true"
    >
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="rounded-card border border-line bg-surface px-4 py-4"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-14" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-4/5" />
        </div>
      ))}
    </div>
  )
}
