import { Link } from '@tanstack/react-router'

import { LxAvatar } from '@/components/ui/lx-avatar'
import { ReactionBar } from '@/features/projects/reactions/reaction-bar'
import { X } from '@/lib/icons'
import { relativeTime } from '@/lib/time'
import type { ExplorePostPreview } from '@/features/explore/types'
import { SignInLink } from './sign-in-link'

// Explore post card, given the same author-led identity as a project card so the
// two read as one family in the feed: author pfp + name lead the header, the repo
// attribution and time sit beneath, then the post body. Renders frameless — the
// enclosing CardSheet owns the border and the divider between rows.
export function ExplorePostCard({
  post,
  onDismiss,
  visitor,
}: {
  post: ExplorePostPreview
  onDismiss?: () => void
  /** Signed-out visitor: counts only, with a sign-in link to react. */
  visitor?: { signInRedirect: string | undefined }
}) {
  const owner =
    post.projectSnapshot.ownerLogin ??
    post.projectSnapshot.fullName.split('/')[0] ??
    post.projectSnapshot.fullName

  return (
    <div className="lx-card bg-surface transition-transform duration-[140ms] ease-out active:scale-[0.997]">
      <div className="flex items-start gap-2">
        <Link
          to="/project/$owner/$repo"
          params={{ owner, repo: post.projectSnapshot.name }}
          search={{ post: String(post._id) }}
          hash={`post-${String(post._id)}`}
          preload="intent"
          className="min-w-0 flex-1 rounded-none px-5 pt-4 pb-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
        >
          {/* Author identity — pfp + name lead, repo + time beneath */}
          <div className="mb-3 flex min-w-0 items-center gap-2.5">
            <LxAvatar
              name={post.actorSnapshot.displayName}
              avatarUrl={post.actorSnapshot.avatarUrl}
              size={34}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-label font-semibold text-text">
                {post.actorSnapshot.displayName}
              </div>
              <div className="truncate font-mono text-meta text-text-faint">
                <span className="text-text-muted">
                  {post.projectSnapshot.fullName}
                </span>{' '}
                · {relativeTime(post.createdAt)}
              </div>
            </div>
          </div>

          {/* Post body — the content */}
          <p className="m-0 line-clamp-3 font-sans text-body leading-6 text-text wrap-anywhere">
            {post.body}
          </p>

          {post.projectTopics.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {post.projectTopics.slice(0, 4).map((topic) => (
                <span
                  key={topic}
                  className="rounded-control border border-line px-2 py-0.5 font-mono text-meta text-text-muted"
                >
                  #{topic}
                </span>
              ))}
            </div>
          )}
        </Link>
        {onDismiss && !visitor && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss post"
            className="mt-3 mr-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md border-none bg-transparent text-text-muted transition-colors hover:text-text"
          >
            <X size={12} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-5 pb-2">
        <ReactionBar
          className="min-w-0 flex-1"
          disabled={Boolean(visitor)}
          reactionCounts={post.reactionCounts}
          targetId={String(post._id)}
          targetType="post"
          viewerReactionTypes={post.viewerReactionTypes}
        />
        {visitor && (
          <SignInLink
            label="Sign in to react to this post"
            redirect={visitor.signInRedirect}
            variant="ghost"
          >
            sign in to react
          </SignInLink>
        )}
      </div>
    </div>
  )
}
