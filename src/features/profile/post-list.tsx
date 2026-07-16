import { Link } from '@tanstack/react-router'

import type { ProfilePostPreview } from '@/features/contracts'
import { compactNumber } from '@/lib/format'
import { relativeTime } from '@/lib/time'
import { EmptyState } from '@/components/ui/empty-state'
import { CardSheet } from '@/components/ui/card-sheet'

export function ProfilePostList({
  emptyLabel,
  posts,
}: {
  emptyLabel: string
  posts: ProfilePostPreview[]
}) {
  if (posts.length === 0) {
    return <EmptyState size="compact" title={emptyLabel} />
  }

  return (
    <CardSheet>
      {posts.map((post) => {
        const owner = post.projectSnapshot.ownerLogin
        const repo = post.projectSnapshot.name

        return (
          <Link
            key={String(post._id)}
            to="/project/$owner/$repo"
            params={{ owner, repo }}
            search={{ post: String(post._id) }}
            hash={`post-${String(post._id)}`}
            preload="intent"
            className="block bg-surface px-5 py-4 text-left no-underline transition-colors hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2.5">
              <span className="min-w-0 truncate font-mono text-[11.5px] text-text-faint">
                {post.projectSnapshot.fullName}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-text-faint">
                {relativeTime(post.createdAt)}
              </span>
            </div>
            <p className="m-0 line-clamp-3 font-sans text-[13.5px] leading-[1.6] text-text">
              {post.body}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-3 font-mono text-[11px] text-text-faint">
              <span>
                {compactNumber(post.reactionCounts.like ?? 0)}{' '}
                {(post.reactionCounts.like ?? 0) === 1 ? 'like' : 'likes'}
              </span>
              <span>
                {compactNumber(post.commentsCount)}{' '}
                {post.commentsCount === 1 ? 'comment' : 'comments'}
              </span>
              {post.projectSnapshot.primaryLanguage && (
                <span>{post.projectSnapshot.primaryLanguage}</span>
              )}
            </div>
          </Link>
        )
      })}
    </CardSheet>
  )
}
