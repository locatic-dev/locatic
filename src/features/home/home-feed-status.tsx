import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useEmptyStateActionMetric } from '@/integrations/convex/metrics'
import {
  HOME_FEED_WINDOW_DAYS,
  type HomeFeedState,
  getQuietFeedTitle,
} from './render-state'

type HomeFeedStatusProps = {
  state: Exclude<HomeFeedState, { kind: 'ready' }>
  onExplore: () => void
  onRetry?: () => void
  /**
   * Discovery suggestions for an account that started this visit following no
   * one. Rendered in its own labelled section below the empty state, never
   * inside the feed. Home passes builders from the viewer's city, or nothing
   * without a city.
   */
  nearbyBuilders?: ReactNode
}

/**
 * "Builders near you": suggestions in their own labelled section, visually
 * apart from the feed. Home keeps it for the whole visit once shown, so it
 * stays while the viewer follows people from it.
 */
export function HomeNearbyBuildersSection({
  children,
}: {
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby="home-nearby-builders"
      className="mt-8 border-t border-line pt-6"
    >
      <h2
        id="home-nearby-builders"
        className="m-0 font-mono text-label font-semibold text-text"
      >
        builders near you
      </h2>
      <p className="mt-1 mb-4 font-sans text-body text-text-muted">
        suggestions, not part of your feed.
      </p>
      {children}
    </section>
  )
}

/** Every Home state except `ready`, which renders feed rows. */
export function HomeFeedStatus({
  state,
  onExplore,
  onRetry,
  nearbyBuilders,
}: HomeFeedStatusProps) {
  const counted = useEmptyStateActionMetric()
  const suggestions = nearbyBuilders ? (
    <HomeNearbyBuildersSection>{nearbyBuilders}</HomeNearbyBuildersSection>
  ) : null

  switch (state.kind) {
    case 'noFollows':
      return (
        <>
          <EmptyState
            title="you're not following anyone yet."
            description="your feed shows activity from people you follow. start with explore to find builders nearby."
            action={{ label: 'go to explore', onClick: counted(onExplore) }}
          />
          {suggestions}
        </>
      )
    case 'quiet30d':
      return (
        <>
          <EmptyState
            title={getQuietFeedTitle(state.followingCount)}
            description={`home keeps the last ${HOME_FEED_WINDOW_DAYS} days of activity from people you follow. explore shows what builders are shipping now.`}
            action={{ label: 'go to explore', onClick: counted(onExplore) }}
          />
          {suggestions}
        </>
      )
    case 'error':
      return (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-card border border-line bg-surface p-6"
        >
          <h2 className="m-0 font-mono text-title font-semibold text-text">
            couldn't load your feed.
          </h2>
          <p className="m-0 font-sans text-sm leading-6 text-text-muted">
            your follows are unchanged. retry, or come back in a moment.
          </p>
          {onRetry ? (
            <div>
              <Button
                type="button"
                variant="primary"
                size="touch"
                onClick={onRetry}
              >
                retry
              </Button>
            </div>
          ) : null}
        </div>
      )
  }
}
