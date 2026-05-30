import type { Id } from '../../../../convex/_generated/dataModel'
import {
  ChevronDown,
  ChevronRight,
  CornerUpLeft,
  Heart,
  Trash2,
} from '@/lib/icons'

export function CommentActions({
  canDelete,
  commentId,
  commentLiked,
  commentLikes,
  disabled,
  hasReplies,
  pendingDelete,
  repliesOpen,
  replyCount,
  repliesRegionId,
  onDelete,
  onLike,
  onReply,
  onToggleReplies,
}: {
  canDelete: boolean
  commentId: Id<'comments'> | string
  commentLiked: boolean
  commentLikes: number
  disabled: boolean
  hasReplies: boolean
  pendingDelete: boolean
  repliesOpen: boolean
  replyCount: number
  repliesRegionId: string
  onDelete: (commentId: Id<'comments'>) => void
  onLike: () => void
  onReply: () => void
  onToggleReplies: () => void
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-text-faint">
      <button
        type="button"
        onClick={onLike}
        aria-label={commentLiked ? 'Unlike comment' : 'Like comment'}
        aria-pressed={commentLiked}
        disabled={disabled}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 py-2 transition-colors hover:text-text disabled:opacity-60 ${
          commentLiked ? 'text-brand' : 'text-inherit'
        }`}
      >
        <Heart
          size={13}
          fill={commentLiked ? 'currentColor' : 'none'}
          strokeWidth={1.6}
        />
        <span>{commentLikes}</span>
      </button>
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
