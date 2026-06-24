import type { Id } from '../../../../convex/_generated/dataModel'
import { ChevronDown, ChevronRight, CornerUpLeft, Trash2 } from '@/lib/icons'
import { ReactionBar } from '@/features/projects/reactions/reaction-bar'

export function CommentActions({
  canDelete,
  commentId,
  disabled,
  hasReplies,
  pendingDelete,
  reactionCounts,
  repliesOpen,
  replyCount,
  repliesRegionId,
  viewerReactionTypes,
  onDelete,
  onReply,
  onToggleReplies,
}: {
  canDelete: boolean
  commentId: Id<'comments'> | string
  disabled: boolean
  hasReplies: boolean
  pendingDelete: boolean
  reactionCounts: Record<string, number>
  repliesOpen: boolean
  replyCount: number
  repliesRegionId: string
  viewerReactionTypes: string[]
  onDelete: (commentId: Id<'comments'>) => void
  onReply: () => void
  onToggleReplies: () => void
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-text-faint">
      <ReactionBar
        disabled={disabled}
        reactionCounts={reactionCounts}
        targetId={String(commentId)}
        targetType="comment"
        viewerReactionTypes={viewerReactionTypes}
      />
      <button
        type="button"
        onClick={onReply}
        aria-label="Reply to comment"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 py-2 text-inherit transition-colors hover:text-text"
      >
        <CornerUpLeft size={13} strokeWidth={1.6} />
        <span>reply</span>
      </button>
      {hasReplies && (
        <button
          type="button"
          onClick={onToggleReplies}
          aria-controls={repliesRegionId}
          aria-expanded={repliesOpen}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 py-2 text-inherit transition-colors hover:text-text"
        >
          {repliesOpen ? (
            <ChevronDown size={13} strokeWidth={1.6} />
          ) : (
            <ChevronRight size={13} strokeWidth={1.6} />
          )}
          <span>
            {repliesOpen ? 'hide' : 'show'} {replyCount}{' '}
            {replyCount === 1 ? 'reply' : 'replies'}
          </span>
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={() => onDelete(commentId as Id<'comments'>)}
          disabled={pendingDelete}
          aria-label="Delete comment"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 py-2 text-inherit transition-colors hover:text-text disabled:opacity-60"
        >
          <Trash2 size={13} strokeWidth={1.6} />
          <span>{pendingDelete ? 'deleting...' : 'delete'}</span>
        </button>
      )}
    </div>
  )
}
