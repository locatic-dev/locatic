import { useRouter } from '@tanstack/react-router'

import type { ProfilePostPreview } from '@/features/contracts'
import { ReactionBar } from '@/features/projects/reactions/reaction-bar'
import { EmptyState } from '@/components/ui/empty-state'
import { MessageSquare } from '@/lib/icons'
import { ProfileActivityCard } from './activity-card'

export function ProfilePostList({
  emptyLabel,
  posts,
  reactionsDisabled = false,
}: {
  emptyLabel: string
  posts: ProfilePostPreview[]
  reactionsDisabled?: boolean
}) {
  const router = useRouter()

  if (posts.length === 0) {
    return <EmptyState size="compact" title={emptyLabel} />
  }

  return (
    <div className="flex flex-col gap-2">
      {posts.map((post) => {
        const owner = post.projectSnapshot.ownerLogin
        const repo = post.projectSnapshot.name
        const navigateOptions = {
          to: '/project/$owner/$repo' as const,
          params: { owner, repo },
          search: { post: String(post._id) },
          hash: `post-${String(post._id)}`,
        }

        return (
          <ProfileActivityCard
            key={String(post._id)}
            authorAvatarUrl={post.actorSnapshot.avatarUrl}
            authorName={post.actorSnapshot.displayName}
            body={post.body}
            context={post.projectSnapshot.fullName}
            createdAt={post.createdAt}
            topics={post.projectTopics}
            onOpen={() => void router.navigate(navigateOptions)}
            footer={
              <>
                <ReactionBar
                  disabled={reactionsDisabled}
                  reactionCounts={post.reactionCounts}
                  targetId={String(post._id)}
                  targetType="post"
                  viewerReactionTypes={post.viewerReactionTypes}
                />
                <button
                  type="button"
                  onClick={() => void router.navigate(navigateOptions)}
                  className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 font-mono text-[11px] text-text-faint transition-colors hover:text-text"
                >
                  <MessageSquare size={12} aria-hidden="true" />
                  {post.commentsCount}{' '}
                  {post.commentsCount === 1 ? 'comment' : 'comments'}
                </button>
              </>
            }
          />
        )
      })}
    </div>
  )
}
