import { useQueryClient } from '@tanstack/react-query'
import { usePaginatedQuery } from 'convex/react'
import { useEffect, useRef, useState } from 'react'

import { api } from '../../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { ProjectDetailPayload } from '@/features/contracts'
import { shouldAutoLoadDeepLinkPage } from '@/features/projects/deep-link'
import { useCreatePost } from '@/features/projects/mutations'
import { ProjectPostCard } from './project-post-card'

export function ProjectPostsSection({
  detail,
  highlightedCommentId,
  highlightedCommentPath,
  highlightedPostId,
  isOwnProject,
  isSignedIn,
  projectDetailQueryKey,
  viewerId,
}: {
  detail: ProjectDetailPayload
  highlightedCommentId: string | null
  highlightedCommentPath: string[]
  highlightedPostId: string | null
  isOwnProject: boolean
  isSignedIn: boolean
  projectDetailQueryKey: readonly unknown[]
  viewerId: string | null
}) {
  const queryClient = useQueryClient()
  const createPost = useCreatePost()
  const [postBody, setPostBody] = useState('')
  const [postingRepoPost, setPostingRepoPost] = useState(false)
  const postLoadAttemptsRef = useRef(0)
  const postLoadTargetRef = useRef<string | null>(null)
  const postRefs = useRef<Record<string, HTMLElement | null>>({})
  const projectPosts = usePaginatedQuery(
    api.posts.listByProject,
    { projectId: detail.project._id },
    { initialNumItems: 8 },
  )
  const posts = projectPosts.results ?? []

  useEffect(() => {
    if (!highlightedPostId || projectPosts.status !== 'CanLoadMore') {
      return
    }
    if (postLoadTargetRef.current !== highlightedPostId) {
      postLoadTargetRef.current = highlightedPostId
      postLoadAttemptsRef.current = 0
    }

    const postIsLoaded = posts.some(
      (post) => String(post._id) === highlightedPostId,
    )
    if (
      shouldAutoLoadDeepLinkPage({
        attempts: postLoadAttemptsRef.current,
        isLoaded: postIsLoaded,
        status: projectPosts.status,
        targetId: highlightedPostId,
      })
    ) {
      postLoadAttemptsRef.current += 1
      projectPosts.loadMore(8)
    }
  }, [highlightedPostId, posts, projectPosts])

  useEffect(() => {
    if (!highlightedPostId) {
      return
    }

    const postElement = postRefs.current[highlightedPostId]
    if (!postElement) {
      return
    }

    postElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [highlightedPostId, posts.length])

  const handleCreatePost = async () => {
    const body = postBody.trim()
    if (!body || postingRepoPost || !isOwnProject) {
      return
    }

    setPostingRepoPost(true)
    try {
      await createPost({
        body,
        projectId: detail.project._id,
      })
      setPostBody('')
      await queryClient.invalidateQueries({ queryKey: projectDetailQueryKey })
    } catch (error) {
      console.error(error)
    } finally {
      setPostingRepoPost(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {isOwnProject && (
        <div className="rounded-[6px] border border-line bg-surface px-4 py-4">
          <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.06em] text-text-faint">
            repo post
          </div>
          <Textarea
            value={postBody}
            onChange={(event) => setPostBody(event.target.value)}
            placeholder="share what changed, what you learned, or what help this repo needs..."
            rows={4}
            className="min-h-30 resize-none border-0 bg-canvas px-3 py-3 font-sans text-sm text-text shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <div className="mt-3 flex justify-end">
            <Button
              variant="brand"
              size="meta"
              onClick={() => void handleCreatePost()}
              disabled={!postBody.trim() || postingRepoPost}
              className="font-mono"
            >
              {postingRepoPost ? 'posting...' : 'post to repo'}
            </Button>
          </div>
        </div>
      )}

      {posts.length === 0 && projectPosts.status !== 'LoadingFirstPage' ? (
        <div className="rounded-[6px] border border-line bg-surface px-4 py-5 font-sans text-sm text-text-muted">
          no repo posts yet.
        </div>
      ) : (
        posts.map((post) => {
          const postKey = String(post._id)
          const highlighted = highlightedPostId === postKey

          return (
            <div
              key={postKey}
              id={`post-${postKey}`}
              ref={(element) => {
                postRefs.current[postKey] = element
              }}
              className={
                highlighted
                  ? 'rounded-[7px] ring-2 ring-brand ring-offset-2 ring-offset-canvas'
                  : undefined
              }
            >
              <ProjectPostCard
                activeHighlightedCommentId={
                  highlighted ? highlightedCommentId : null
                }
                highlightedCommentPath={
                  highlighted ? highlightedCommentPath : []
                }
                isOwner={isOwnProject}
                isSignedIn={isSignedIn}
                post={post}
                projectDetailQueryKey={projectDetailQueryKey}
                viewerId={viewerId}
              />
            </div>
          )
        })
      )}

      {projectPosts.status === 'CanLoadMore' && (
        <Button
          variant="monoOutline"
          size="meta"
          onClick={() => projectPosts.loadMore(8)}
          className="self-start font-mono"
        >
          load more posts
        </Button>
      )}
    </div>
  )
}
