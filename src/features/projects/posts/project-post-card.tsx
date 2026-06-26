import { useQueryClient } from '@tanstack/react-query'
import { usePaginatedQuery } from 'convex/react'
import { useEffect, useRef, useState } from 'react'

import { api } from '../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { Textarea } from '@/components/ui/textarea'
import { relativeTime } from '@/lib/time'
import { MessageSquare, Pencil, Trash2 } from '@/lib/icons'
import { shouldAutoLoadDeepLinkPage } from '@/features/projects/deep-link'
import {
  useAddComment,
  useDeleteComment,
  useDeletePost,
  useUpdatePost,
} from '@/features/projects/mutations'
import { CommentThread } from '@/features/projects/comments/comment-thread'
import { commentComposerTextareaClass } from '@/features/projects/comments/composer-styles'
import { removeReplyDraft } from '@/features/projects/comments/drafts'
import { useCommentThreadState } from '@/features/projects/comments/use-comment-thread-state'
import type { ProjectCommentView } from '@/features/projects/comments/types'
import { ReactionBar } from '@/features/projects/reactions/reaction-bar'

type ProjectPost = Doc<'posts'> & {
  viewerHasLiked: boolean
  viewerReactionTypes: string[]
}

export function ProjectPostCard({
  activeHighlightedCommentId,
  highlightedCommentPath,
  isOwner,
  isSignedIn,
  post,
  projectDetailQueryKey,
  viewerId,
}: {
  activeHighlightedCommentId: string | null
  highlightedCommentPath: string[]
  isOwner: boolean
  isSignedIn: boolean
  post: ProjectPost
  projectDetailQueryKey: readonly unknown[]
  viewerId: string | null
}) {
  const queryClient = useQueryClient()
  const addComment = useAddComment()
  const deleteComment = useDeleteComment()
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
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(post.body)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingPost, setDeletingPost] = useState(false)
  const commentLoadAttemptsRef = useRef(0)
  const commentLoadTargetRef = useRef<string | null>(null)
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
  const highlightedRootCommentId =
    highlightedCommentPath[0] ?? activeHighlightedCommentId

  useEffect(() => {
    if (!highlightedRootCommentId || commentRoots.status !== 'CanLoadMore') {
      return
    }
    if (commentLoadTargetRef.current !== highlightedRootCommentId) {
      commentLoadTargetRef.current = highlightedRootCommentId
      commentLoadAttemptsRef.current = 0
    }

    const rootIsLoaded = comments.some(
      (commentItem) => String(commentItem._id) === highlightedRootCommentId,
    )
    if (
      shouldAutoLoadDeepLinkPage({
        attempts: commentLoadAttemptsRef.current,
        isLoaded: rootIsLoaded,
        status: commentRoots.status,
        targetId: highlightedRootCommentId,
      })
    ) {
      commentLoadAttemptsRef.current += 1
      commentRoots.loadMore(6)
    }
  }, [commentRoots, comments, highlightedRootCommentId])

  useEffect(() => {
    if (!activeHighlightedCommentId) {
      return
    }

    for (const commentId of highlightedCommentPath) {
      expandCommentThread(commentId)
    }
  }, [activeHighlightedCommentId, expandCommentThread, highlightedCommentPath])

  useEffect(() => {
    if (!activeHighlightedCommentId) {
      return
    }

    const commentElement = commentRefs.current[activeHighlightedCommentId]
    if (!commentElement) {
      return
    }

    commentElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [activeHighlightedCommentId, comments.length, expandedIds])

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
      reactionCounts: {},
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
      viewerReactionTypes: [],
    }
    setPendingReplies((current) => ({
      ...current,
      [parentKey]: [...(current[parentKey] ?? []), pendingReply],
    }))
    setReplyDrafts((current) => removeReplyDraft(current, parentKey))

    try {
      await addComment({
        content: draft,
        parentId,
        targetId: String(post._id),
        targetType: 'post',
      })
    } catch (error) {
      console.error(error)
      setReplyDrafts((current) => ({
        ...current,
        [parentKey]: draft,
      }))
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
    <article className="rounded-card border border-line bg-surface px-4 py-4">
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
        <p className="mb-4 whitespace-pre-wrap font-sans text-[14px] leading-7 text-text wrap-anywhere">
          {post.body}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 border-y border-line py-2">
        <ReactionBar
          disabled={!isSignedIn}
          reactionCounts={post.reactionCounts}
          targetId={String(post._id)}
          targetType="post"
          viewerReactionTypes={post.viewerReactionTypes ?? []}
        />
        <button
          type="button"
          onClick={() => setCommentComposerOpen((current) => !current)}
          disabled={!isSignedIn}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-transparent px-2 py-2 font-mono text-[11.5px] text-text-muted transition-colors hover:text-text"
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
            className={commentComposerTextareaClass}
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
              activeHighlightedCommentId={activeHighlightedCommentId}
              commentItem={commentItem}
              commentRefs={commentRefs}
              depth={0}
              expandedIds={expandedIds}
              handleDeleteComment={handleDeleteComment}
              handleReply={handleReply}
              isSignedIn={isSignedIn}
              onToggleReplies={toggleCommentThread}
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
