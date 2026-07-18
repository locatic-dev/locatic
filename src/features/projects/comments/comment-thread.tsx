import { usePaginatedQuery } from 'convex/react'
import type React from 'react'
import type { Id } from '../../../../convex/_generated/dataModel'
import { api } from '../../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { cardVariants } from '@/components/ui/card'
import { CityPill } from '@/components/ui/city-pill'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { relativeTime } from '@/lib/time'
import { CommentActions } from './comment-actions'
import { commentComposerTextareaClass } from './composer-styles'
import type { ProjectCommentView } from './types'

function ReplySkeleton() {
  return (
    <div
      aria-hidden="true"
      className="relative min-w-0 border-l border-line pl-3 sm:pl-4"
    >
      <div className="flex min-w-0 gap-3 py-1">
        <Skeleton className="mt-0.5 size-[26px] shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-12" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-[min(28rem,88%)]" />
            <Skeleton className="h-3.5 w-[min(18rem,62%)]" />
          </div>
          <div className="flex items-center gap-3 pt-0.5">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-14" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function CommentThread({
  activeHighlightedCommentId,
  commentItem,
  commentRefs,
  depth,
  expandedIds,
  handleDeleteComment,
  handleReply,
  isSignedIn,
  onToggleReplies,
  pendingDeleteIds,
  pendingReplies,
  replyDrafts,
  replyingToId,
  setReplyDrafts,
  viewerId,
}: {
  activeHighlightedCommentId: string | null
  commentItem: ProjectCommentView
  commentRefs: React.MutableRefObject<Record<string, HTMLElement | null>>
  depth: number
  expandedIds: Set<string>
  handleDeleteComment: (commentId: Id<'comments'>) => Promise<void>
  handleReply: (parentId: Id<'comments'>) => Promise<void>
  isSignedIn: boolean
  onToggleReplies: (commentId: string) => void
  pendingDeleteIds: Set<string>
  pendingReplies: Record<string, ProjectCommentView[]>
  replyDrafts: Record<string, string>
  replyingToId: string | null
  setReplyDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>
  viewerId: string | null
}) {
  const commentId = String(commentItem._id)
  const comment = commentItem
  const repliesOpen = expandedIds.has(commentId)
  const previewReplies = comment.previewReplies ?? []
  const pendingChildReplies = pendingReplies[commentId] ?? []
  const shouldLoadReplies =
    repliesOpen &&
    !comment.pending &&
    comment.replyCount > previewReplies.length
  const repliesPage = usePaginatedQuery(
    api.comments.listReplies,
    shouldLoadReplies
      ? { parentId: commentItem._id as Id<'comments'> }
      : 'skip',
    { initialNumItems: Math.max(6, previewReplies.length + 4) },
  )
  const previewIds = new Set(previewReplies.map((reply) => String(reply._id)))
  const loadedReplies = ((repliesPage.results ?? []) as ProjectCommentView[])
    .filter((reply) => !previewIds.has(String(reply._id)))
    .map((reply) => reply)
  const visibleReplies = [
    ...previewReplies,
    ...pendingChildReplies,
    ...loadedReplies,
  ].filter((reply) => !reply.isDeleted || reply.replyCount > 0 || reply.pending)
  const canDelete = !comment.pending && viewerId === String(comment.authorId)
  const highlighted = activeHighlightedCommentId === commentId
  const nested = depth > 0
  const hasReplies =
    comment.replyCount > 0 ||
    previewReplies.length > 0 ||
    pendingChildReplies.length > 0
  const repliesRegionId = `comment-${commentId}-replies`
  const showReplySkeleton =
    repliesPage.status === 'LoadingFirstPage' && visibleReplies.length === 0

  if (comment.isDeleted && !hasReplies) {
    return null
  }

  return (
    <article
      id={`comment-${commentId}`}
      ref={(node) => {
        commentRefs.current[commentId] = node
      }}
      className={
        nested
          ? 'relative min-w-0 border-l border-line pl-3 sm:pl-4'
          : cardVariants({ density: 'compact' })
      }
    >
      <div
        className={`min-w-0 rounded-[6px] transition-[opacity,transform,background-color] duration-300 motion-reduce:transition-none ${
          highlighted ? 'bg-brand-quiet px-3 py-3' : ''
        } ${comment.pending ? 'opacity-70' : 'opacity-100'}`}
      >
        <div className="flex min-w-0 gap-3">
          <LxAvatar
            name={comment.authorSnapshot.displayName}
            avatarUrl={comment.authorSnapshot.avatarUrl}
            size={nested ? 26 : 32}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[12.5px] font-semibold text-text">
                {comment.authorSnapshot.displayName}
              </span>
              {!nested && comment.authorSnapshot.cityName && (
                <CityPill city={comment.authorSnapshot.cityName} />
              )}
              <span className="font-mono text-[11px] text-text-faint">
                {comment.pending
                  ? 'posting...'
                  : relativeTime(comment.createdAt)}
              </span>
            </div>
            <p className="mt-1.5 mb-0 font-sans text-[13.5px] leading-[1.6] text-text wrap-anywhere">
              {comment.content}
            </p>

            {!comment.pending && (
              <CommentActions
                canDelete={canDelete}
                commentId={comment._id}
                disabled={!isSignedIn}
                hasReplies={hasReplies}
                pendingDelete={pendingDeleteIds.has(commentId)}
                reactionCounts={
                  comment.reactionCounts ?? { like: comment.likesCount }
                }
                repliesOpen={repliesOpen}
                replyCount={Math.max(comment.replyCount, visibleReplies.length)}
                repliesRegionId={repliesRegionId}
                viewerReactionTypes={comment.viewerReactionTypes ?? []}
                onDelete={(id) => void handleDeleteComment(id)}
                onReply={() =>
                  setReplyDrafts((current) => ({
                    ...current,
                    [commentId]: current[commentId] ?? '',
                  }))
                }
                onToggleReplies={() => onToggleReplies(commentId)}
              />
            )}

            {replyDrafts[commentId] !== undefined && isSignedIn && (
              <div className="mt-3 flex flex-wrap gap-3 rounded-[6px] border border-line bg-canvas px-3 py-3">
                <Textarea
                  value={replyDrafts[commentId] ?? ''}
                  onChange={(event) =>
                    setReplyDrafts((current) => ({
                      ...current,
                      [commentId]: event.target.value,
                    }))
                  }
                  rows={2}
                  placeholder={`reply to ${comment.authorSnapshot.displayName}...`}
                  className={commentComposerTextareaClass}
                />
                <div className="flex items-end gap-2">
                  <Button
                    variant="monoOutline"
                    size="meta"
                    onClick={() =>
                      setReplyDrafts((current) => {
                        const next = { ...current }
                        delete next[commentId]
                        return next
                      })
                    }
                    className="font-mono"
                  >
                    cancel
                  </Button>
                  <Button
                    variant="brand"
                    size="meta"
                    onClick={() =>
                      void handleReply(commentItem._id as Id<'comments'>)
                    }
                    disabled={
                      !(replyDrafts[commentId] ?? '').trim() ||
                      replyingToId === commentId
                    }
                    className="font-mono"
                  >
                    {replyingToId === commentId ? 'posting...' : 'reply'}
                  </Button>
                </div>
              </div>
            )}

            {repliesOpen && (
              <div
                id={repliesRegionId}
                className="mt-3 flex flex-col gap-3 transition-[opacity,transform] duration-200 motion-reduce:transition-none"
              >
                {visibleReplies.map((reply) => (
                  <CommentThread
                    key={String(reply._id)}
                    activeHighlightedCommentId={activeHighlightedCommentId}
                    commentItem={reply}
                    commentRefs={commentRefs}
                    depth={depth + 1}
                    expandedIds={expandedIds}
                    handleDeleteComment={handleDeleteComment}
                    handleReply={handleReply}
                    isSignedIn={isSignedIn}
                    onToggleReplies={onToggleReplies}
                    pendingDeleteIds={pendingDeleteIds}
                    pendingReplies={pendingReplies}
                    replyDrafts={replyDrafts}
                    replyingToId={replyingToId}
                    setReplyDrafts={setReplyDrafts}
                    viewerId={viewerId}
                  />
                ))}
                {showReplySkeleton && (
                  <div
                    role="status"
                    aria-label="Loading replies"
                    className="space-y-3"
                  >
                    <ReplySkeleton />
                    {comment.replyCount > 1 && <ReplySkeleton />}
                  </div>
                )}
                {repliesPage.status === 'CanLoadMore' && (
                  <button
                    type="button"
                    onClick={() => repliesPage.loadMore(6)}
                    className="ml-3 inline-flex min-h-11 items-center self-start rounded-md px-2 py-2 font-mono text-[11px] text-text-muted transition-colors hover:text-text"
                  >
                    show more replies
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
