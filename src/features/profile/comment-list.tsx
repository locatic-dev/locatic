import { ReactionBar } from '@/features/projects/reactions/reaction-bar'
import type { ProfileCommentPreview } from '@/features/contracts'
import { EmptyState } from '@/components/ui/empty-state'
import { MessageSquare } from '@/lib/icons'
import {
  commentAvailabilityCopy,
  isCommentTargetOpenable,
} from './comment-navigation'
import { ProfileActivityCard } from './activity-card'

export function ProfileCommentList({
  authorAvatarUrl,
  authorName,
  comments,
  emptyLabel,
  onOpenComment,
  reactionsDisabled,
}: {
  authorAvatarUrl?: string | null
  authorName: string
  comments: ProfileCommentPreview[]
  emptyLabel: string
  onOpenComment: (comment: ProfileCommentPreview) => void
  reactionsDisabled: boolean
}) {
  if (comments.length === 0) {
    return <EmptyState size="compact" headingLevel={3} title={emptyLabel} />
  }

  return (
    <div className="flex flex-col gap-2">
      {comments.map((comment) => {
        const openable = isCommentTargetOpenable(comment)
        return (
          <ProfileActivityCard
            key={String(comment._id)}
            authorAvatarUrl={authorAvatarUrl}
            authorName={authorName}
            body={comment.content}
            context={comment.targetLabel}
            createdAt={comment.createdAt}
            disabled={!openable}
            onOpen={() => onOpenComment(comment)}
            footer={
              <>
                <ReactionBar
                  disabled={reactionsDisabled || !openable}
                  reactionCounts={comment.reactionCounts}
                  targetId={String(comment._id)}
                  targetType="comment"
                  viewerReactionTypes={comment.viewerReactionTypes}
                />
                <div className="ml-auto flex min-h-7 items-center gap-3 px-2 pointer-coarse:min-h-11 font-mono text-meta text-text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <MessageSquare size={12} aria-hidden="true" />
                    {comment.replyCount}{' '}
                    {comment.replyCount === 1 ? 'reply' : 'replies'}
                  </span>
                  <span>
                    {openable
                      ? 'open thread'
                      : commentAvailabilityCopy(comment)}
                  </span>
                </div>
              </>
            }
          />
        )
      })}
    </div>
  )
}
