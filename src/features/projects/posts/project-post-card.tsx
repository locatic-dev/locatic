import { useQueryClient } from '@tanstack/react-query'
import { usePaginatedQuery } from 'convex/react'
import { useRef, useState } from 'react'

import { api } from '../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { Textarea } from '@/components/ui/textarea'
import { relativeTime } from '@/lib/time'
import { Heart, MessageSquare, Pencil, Trash2 } from '@/lib/icons'
import {
  useAddComment,
  useDeleteComment,
  useDeletePost,
  useReactToTarget,
  useUnreactFromTarget,
  useUpdatePost,
} from '@/features/projects/mutations'
import { CommentThread } from '@/features/projects/comments/comment-thread'
import { useCommentThreadState } from '@/features/projects/comments/use-comment-thread-state'
import type {
  ProjectCommentLikeOverride,
  ProjectCommentView,
} from '@/features/projects/comments/types'

type ProjectPost = Doc<'posts'> & {
  viewerHasLiked: boolean
}

export function ProjectPostCard({
  isOwner,
  isSignedIn,
  post,
  projectDetailQueryKey,
  viewerId,
}: {
  isOwner: boolean
  isSignedIn: boolean
  post: ProjectPost
  projectDetailQueryKey: readonly unknown[]
  viewerId: string | null
}) {
  const queryClient = useQueryClient()
  const addComment = useAddComment()
  const deleteComment = useDeleteComment()
  const reactToTarget = useReactToTarget()
  const unreactFromTarget = useUnreactFromTarget()
  const updatePost = useUpdatePost()
  const deletePost = useDeletePost()

  const [comment, setComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [commentComposerOpen, setCommentComposerOpen] = useState(false)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(
    new Set(),
  )
  const [pendingReplies, setPendingReplies] = useState<
    Record<string, ProjectCommentView[]>
  >({})
  const [commentLikeOverrides, setCommentLikeOverrides] = useState<
    Record<string, ProjectCommentLikeOverride>
  >({})
  const [pendingCommentLikeId, setPendingCommentLikeId] = useState<
    string | null
  >(null)
  const [postLikeOverride, setPostLikeOverride] = useState<{
    count: number
    liked: boolean
  } | null>(null)
  const [postLikePending, setPostLikePending] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(post.body)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingPost, setDeletingPost] = useState(false)
  const commentRefs = useRef<Record<string, HTMLElement | null>>({})
  const {
    expand: expandCommentThread,
    expandedIds,
    toggle: toggleCommentThread,
  } = useCommentThreadState()

  const commentRoots = usePaginatedQuery(
    api.comments.listRootsByTarget,
    {
      targetId: String(post._id),
      targetType: 'post',
      sort: 'newest',
    },
    { initialNumItems: 6 },
  )
  const comments = (commentRoots.results ?? []) as ProjectCommentView[]
  const visibleRootComments = comments.filter(
    (commentItem) => !commentItem.isDeleted || commentItem.replyCount > 0,
  )
  const postLiked = postLikeOverride?.liked ?? post.viewerHasLiked
  const postLikes = postLikeOverride?.count ?? post.reactionCounts.like ?? 0

  const handleTogglePostLike = async () => {
    if (!isSignedIn || postLikePending) {
      return
    }

    const nextLiked = !postLiked
    setPostLikeOverride({
      count: Math.max(0, postLikes + (nextLiked ? 1 : -1)),
      liked: nextLiked,
    })
    setPostLikePending(true)

    try {
      if (postLiked) {
        await unreactFromTarget({
          reactionType: 'like',
          targetId: String(post._id),
          targetType: 'post',
        })
      } else {
        await reactToTarget({
          reactionType: 'like',
          targetId: String(post._id),
          targetType: 'post',
        })
      }
      window.setTimeout(() => setPostLikeOverride(null), 1000)
    } catch (error) {
      console.error(error)
      setPostLikeOverride(null)
    } finally {
      setPostLikePending(false)
    }
  }

  const handlePostComment = async () => {
    const content = comment.trim()
    if (!content || postingComment || !isSignedIn) {
      return
    }

    setPostingComment(true)
    try {
      await addComment({
        content,
        parentId: null,
        targetId: String(post._id),
        targetType: 'post',
      })
      setComment('')
      setCommentComposerOpen(false)
      await queryClient.invalidateQueries({ queryKey: projectDetailQueryKey })
    } catch (error) {
      console.error(error)
    } finally {
      setPostingComment(false)
    }
  }

  const handleReply = async (parentId: Id<'comments'>) => {
    const parentKey = String(parentId)
    const draft = replyDrafts[parentKey]?.trim() ?? ''
    if (!draft || replyingToId === parentKey || !isSignedIn || !viewerId) {
      return
    }

    setReplyingToId(parentKey)
    expandCommentThread(parentKey)
    const pendingReplyId = `pending-${parentKey}-${Date.now()}`
    const pendingReply: ProjectCommentView = {
      _creationTime: Date.now(),
      _id: pendingReplyId,
      authorId: viewerId as Id<'users'>,
      authorSnapshot: {
        avatarUrl: '',
        cityId: null,
        cityName: null,
        displayName: 'you',
      },
      content: draft,
      createdAt: Date.now(),
      isDeleted: false,
      likesCount: 0,
      parentId,
      pending: true,
      replyCount: 0,
      replies: [],
      targetId: String(post._id),
      targetSnapshot: {
        projectFullName: post.projectSnapshot.fullName,
        projectOwner:
          post.projectSnapshot.ownerLogin ??
          post.projectSnapshot.fullName.split('/')[0] ??
          post.projectSnapshot.fullName,
        projectRepo: post.projectSnapshot.name,
        targetLabel: `${post.projectSnapshot.fullName} post`,
        updateTitle: null,
      },
      targetType: 'post',
      viewerHasLiked: false,
    }
    setPendingReplies((current) => ({
      ...current,
      [parentKey]: [...(current[parentKey] ?? []), pendingReply],
    }))

    try {
      await addComment({
        content: draft,
        parentId,
        targetId: String(post._id),
        targetType: 'post',
      })
      setReplyDrafts((current) => {
        const next = { ...current }
        delete next[parentKey]
        return next
      })
    } catch (error) {
      console.error(error)
    } finally {
      setPendingReplies((current) => ({
        ...current,
        [parentKey]: (current[parentKey] ?? []).filter(
          (reply) => reply._id !== pendingReplyId,
        ),
      }))
      setReplyingToId(null)
    }
  }

  const handleToggleCommentLike = async (
    commentId: string,
    currentlyLiked: boolean,
    likesCount: number,
  ) => {
    if (!isSignedIn || pendingCommentLikeId === commentId) {
      return
    }

    const nextLiked = !currentlyLiked
    setCommentLikeOverrides((current) => ({
      ...current,
      [commentId]: {
        likesCount: Math.max(0, likesCount + (nextLiked ? 1 : -1)),
        viewerHasLiked: nextLiked,
      },
    }))
    setPendingCommentLikeId(commentId)

    try {
      if (currentlyLiked) {
        await unreactFromTarget({
          reactionType: 'like',
          targetId: commentId,
          targetType: 'comment',
        })
      } else {
        await reactToTarget({
          reactionType: 'like',
          targetId: commentId,
          targetType: 'comment',
        })
      }
      window.setTimeout(() => {
        setCommentLikeOverrides((current) => {
          const next = { ...current }
          delete next[commentId]
          return next
        })
      }, 1000)
    } catch (error) {
      console.error(error)
      setCommentLikeOverrides((current) => {
        const next = { ...current }
        delete next[commentId]
        return next
      })
    } finally {
      setPendingCommentLikeId(null)
    }
  }

  const handleDeleteComment = async (commentId: Id<'comments'>) => {
    const commentKey = String(commentId)
    if (pendingDeleteIds.has(commentKey)) {
      return
    }

    setPendingDeleteIds((current) => new Set(current).add(commentKey))
    try {
      await deleteComment({ commentId })
    } catch (error) {
      console.error(error)
    } finally {
      setPendingDeleteIds((current) => {
        const next = new Set(current)
        next.delete(commentKey)
        return next
      })
    }
  }

  const handleSaveEdit = async () => {
    const body = editBody.trim()
    if (!body || savingEdit) {
      return
    }

    setSavingEdit(true)
    try {
      await updatePost({ postId: post._id, body })
      setEditing(false)
    } catch (error) {
      console.error(error)
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDeletePost = async () => {
    if (deletingPost) {
      return
    }

    setDeletingPost(true)
    try {
      await deletePost({ postId: post._id })
      await queryClient.invalidateQueries({ queryKey: projectDetailQueryKey })
    } catch (error) {
      console.error(error)
    } finally {
      setDeletingPost(false)
    }
  }

  return (
    <article className="rounded-[6px] border border-line bg-surface px-4 py-4">
      <div className="mb-3 flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <LxAvatar
            name={post.actorSnapshot.displayName}
            avatarUrl={post.actorSnapshot.avatarUrl}
            size={34}
          />
          <div className="min-w-0">
            <div className="font-mono text-[12.5px] font-semibold text-text">
              {post.actorSnapshot.displayName}
            </div>
            <div className="font-mono text-[11px] text-text-faint">
              {relativeTime(post.createdAt)}
              {post.updatedAt > post.createdAt ? ' · edited' : ''}
            </div>
          </div>
        </div>

        {isOwner && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setEditBody(post.body)
                setEditing(true)
              }}
              aria-label="Edit post"
            >
              <Pencil size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void handleDeletePost()}
              disabled={deletingPost}
              aria-label="Delete post"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="mb-4 rounded-[6px] border border-line bg-canvas px-3 py-3">
          <Textarea
            value={editBody}
            onChange={(event) => setEditBody(event.target.value)}
            rows={4}
            className="min-h-28 resize-none border-0 bg-transparent px-0 py-0 font-sans text-sm text-text shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button
              variant="monoOutline"
              size="meta"
              onClick={() => setEditing(false)}
              className="font-mono"
            >
              cancel
            </Button>
            <Button
              variant="brand"
              size="meta"
              onClick={() => void handleSaveEdit()}
              disabled={!editBody.trim() || savingEdit}
              className="font-mono"
            >
              {savingEdit ? 'saving...' : 'save'}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mb-4 whitespace-pre-wrap font-sans text-[14px] leading-7 text-text-muted wrap-anywhere">
          {post.body}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 border-y border-line py-2">
        <button
          type="button"
          onClick={() => void handleTogglePostLike()}
          disabled={!isSignedIn || postLikePending}
          aria-pressed={postLiked}
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-md bg-transparent px-2 py-2 font-mono text-[11.5px] transition-colors ${
            postLiked ? 'text-brand' : 'text-text-faint hover:text-brand'
          }`}
        >
          <Heart
            size={14}
            fill={postLiked ? 'currentColor' : 'none'}
            strokeWidth={1.6}
          />
          {postLikes}
        </button>
        <button
          type="button"
          onClick={() => setCommentComposerOpen((current) => !current)}
          disabled={!isSignedIn}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-transparent px-2 py-2 font-mono text-[11.5px] text-text-faint transition-colors hover:text-text"
        >
          <MessageSquare size={14} strokeWidth={1.6} />
          {post.commentsCount} comments
        </button>
      </div>

      {commentComposerOpen && isSignedIn && (
        <div className="mb-4 flex flex-wrap gap-3 rounded-[6px] border border-line bg-canvas px-3 py-3">
          <Textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="reply to this repo post..."
            rows={2}
            className="min-h-18 flex-1 resize-none border-0 bg-transparent px-0 py-0 font-sans text-[13.5px] text-text shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <div className="flex items-end gap-2">
            <Button
              variant="monoOutline"
              size="meta"
              onClick={() => {
                setComment('')
                setCommentComposerOpen(false)
              }}
              className="font-mono"
            >
              cancel
            </Button>
            <Button
              variant="brand"
              size="meta"
              onClick={() => void handlePostComment()}
              disabled={!comment.trim() || postingComment}
              className="font-mono font-semibold"
            >
              {postingComment ? 'posting...' : 'post'}
            </Button>
          </div>
        </div>
      )}

      {visibleRootComments.length > 0 && (
        <div className="flex flex-col gap-3">
          {visibleRootComments.map((commentItem) => (
            <CommentThread
              key={String(commentItem._id)}
              activeHighlightedCommentId={null}
              commentItem={commentItem}
              commentLikeOverrides={commentLikeOverrides}
              commentRefs={commentRefs}
              depth={0}
              expandedIds={expandedIds}
              handleDeleteComment={handleDeleteComment}
              handleReply={handleReply}
              handleToggleCommentLike={handleToggleCommentLike}
              isSignedIn={isSignedIn}
              onToggleReplies={toggleCommentThread}
              pendingCommentLikeId={pendingCommentLikeId}
              pendingDeleteIds={pendingDeleteIds}
              pendingReplies={pendingReplies}
              replyDrafts={replyDrafts}
              replyingToId={replyingToId}
              setReplyDrafts={setReplyDrafts}
              viewerId={viewerId}
            />
          ))}
          {commentRoots.status === 'CanLoadMore' && (
            <Button
              variant="monoOutline"
              size="meta"
              onClick={() => commentRoots.loadMore(6)}
              className="self-start font-mono"
            >
              load more comments
            </Button>
          )}
        </div>
      )}
    </article>
  )
}
