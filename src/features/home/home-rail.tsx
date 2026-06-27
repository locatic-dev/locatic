import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Heart } from 'lucide-react'
import { pulseQueryOptions } from '@/integrations/convex/query-options'
import { getFreshExploreSearch } from '@/features/explore/state'

const RAIL_LIMIT = 6

/**
 * Dormant Home rail experiment for weekly pulse/trending projects.
 *
 * This component is intentionally not rendered by `src/routes/_app/home.tsx`
 * while the Home dashboard model is still being reworked. Keep it around as a
 * ready-to-reenable spike, but do not treat it as active product surface.
 */
export function HomePulseRail() {
  const { data, isError, isPending } = useQuery({
    ...pulseQueryOptions({
      scopeType: 'global',
      scopeId: null,
      timeWindow: 'week',
      sort: 'locatic_likes',
    }),
    staleTime: 60_000,
  })

  const items = (data?.items ?? []).slice(0, RAIL_LIMIT)

  return (
    <section
      aria-labelledby="home-pulse-heading"
      className="rounded-card border border-line bg-surface/60 p-4"
    >
      <h2
        id="home-pulse-heading"
        className="m-0 font-mono text-[11px] uppercase tracking-[0.08em] text-text-faint"
      >
        pulse · this week
      </h2>

      {isPending ? (
        <div className="mt-3 flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="lx-skeleton h-9 w-full rounded-md" />
          ))}
        </div>
      ) : isError ? (
        <p className="mt-3 font-sans text-[13px] leading-5 text-text-muted">
          pulse unavailable.
        </p>
      ) : items.length === 0 ? (
        <p className="mt-3 font-sans text-[13px] leading-5 text-text-muted">
          No trending projects yet this week.
        </p>
      ) : (
        <ol className="m-0 mt-2 flex list-none flex-col gap-0.5 p-0">
          {items.map((item, index) => {
            const snapshot = item.projectSnapshot
            return (
              <li key={item.projectId}>
                <Link
                  to="/project/$owner/$repo"
                  params={{ owner: snapshot.ownerLogin, repo: snapshot.name }}
                  className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-surface-raised"
                >
                  <span className="w-4 shrink-0 text-right font-mono text-[11px] text-text-faint">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[12.5px] text-text">
                      {snapshot.name}
                    </span>
                    <span className="block truncate font-mono text-[10.5px] text-text-faint">
                      {snapshot.ownerLogin}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-text-muted">
                    <Heart size={11} aria-hidden />
                    {snapshot.likesCount}
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      )}

      <Link
        to="/explore"
        search={getFreshExploreSearch()}
        className="mt-3 inline-block font-mono text-[11.5px] text-brand hover:underline"
      >
        explore more →
      </Link>
    </section>
  )
}
