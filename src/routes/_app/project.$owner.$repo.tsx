import { useAuth } from '@clerk/tanstack-react-start'
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import {
  createFileRoute,
  useCanGoBack,
  useRouter,
} from '@tanstack/react-router'
import { useState } from 'react'
import { projectDetailQueryOptions } from '@/features/projects/queries'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { LangDot } from '@/components/ui/lang-dot'
import { StatusPill } from '@/components/ui/status-pill'
import { CityPill } from '@/components/ui/city-pill'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { relativeTime } from '@/lib/time'
import { compactNumber } from '@/lib/format'
import {
  Star,
  Heart,
  MessageSquare,
  ArrowLeft,
  ExternalLink,
} from '@/lib/icons'
import {
  useLikeProject,
  useUnlikeProject,
  useAddComment,
} from '@/features/projects/mutations'
import { useFollowUser, useUnfollowUser } from '@/features/follows/mutations'
import {
  mapProjectDetail,
  mapViewerSummary,
  type ProjectDetailPayload,
  type ViewerSummaryPayload,
} from '@/features/contracts'
import { socialLinkHref } from '@/lib/social-links'
import { useOpenConversation } from '@/features/inbox/use-open-conversation'
import { viewerSummaryQueryOptions } from '@/features/viewer/queries'

export const Route = createFileRoute('/_app/project/$owner/$repo')({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      projectDetailQueryOptions(`${params.owner}/${params.repo}`),
    )

    if (context.auth.isAuthenticated) {
      await context.queryClient.ensureQueryData(viewerSummaryQueryOptions())
    }
  },
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { owner, repo } = Route.useParams()
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const { isSignedIn } = useAuth()
  const queryClient = useQueryClient()
  const likeProject = useLikeProject()
  const unlikeProject = useUnlikeProject()
  const addComment = useAddComment()
  const followUser = useFollowUser()
  const unfollowUser = useUnfollowUser()
  const { openConversation, pendingUserId } = useOpenConversation()

  const fullName = `${owner}/${repo}`
  const { data } = useSuspenseQuery(projectDetailQueryOptions(fullName))
  const viewerSummaryQuery = useQuery({
    ...viewerSummaryQueryOptions(),
    enabled: isSignedIn,
  })
  const viewer = mapViewerSummary(
    viewerSummaryQuery.data as ViewerSummaryPayload | undefined,
  )
  const detail = mapProjectDetail(
    data as ProjectDetailPayload | null | undefined,
  )

  const [comment, setComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [likePending, setLikePending] = useState(false)
  const [followPending, setFollowPending] = useState(false)
  const [likedOverride, setLikedOverride] = useState<boolean | null>(null)
  const [followedOverride, setFollowedOverride] = useState<boolean | null>(null)

  if (!detail) {
    return <div className="p-8 text-text-muted">project not found.</div>
  }

  const liked = likedOverride ?? detail.viewerHasLiked
  const followed = followedOverride ?? detail.viewerFollowsOwner
  const githubStars = detail.project.github.stargazersCount
  const likeDelta = liked === detail.viewerHasLiked ? 0 : liked ? 1 : -1
  const locaticLikes = detail.project.locatic.likesCount + likeDelta
  const comments = detail.comments.filter(
    (commentItem) => !commentItem.isDeleted,
  )
  const description =
    detail.project.github.description || 'no project description provided yet.'
  const readmePreview =
    detail.project.github.readmePreview ||
    description ||
    `# ${detail.project.github.name}`
  const isOwnProject = viewer?.id === String(detail.owner.userId)
  const githubHref = `https://github.com/${detail.project.github.fullName}`
  const ownerGithubHref = socialLinkHref('github', detail.owner.githubUsername)
  const ownerXHref = socialLinkHref('x', detail.owner.socialLinks.x)
  const ownerLinkedinHref = socialLinkHref(
    'linkedin',
    detail.owner.socialLinks.linkedin,
  )
  const ownerWebsiteHref = socialLinkHref(
    'website',
    detail.owner.socialLinks.website,
  )

  const handleLike = async () => {
    if (likePending || !isSignedIn) {
      return
    }

    setLikePending(true)
    setLikedOverride(!liked)

    try {
      if (liked) {
        await unlikeProject({ projectId: detail.project._id })
      } else {
        await likeProject({ projectId: detail.project._id })
      }
    } catch (error) {
      console.error(error)
      setLikedOverride(liked)
    } finally {
      setLikePending(false)
    }
  }

  const handleFollow = async () => {
    if (followPending || !isSignedIn) {
      return
    }

    setFollowPending(true)
    setFollowedOverride(!followed)

    try {
      if (followed) {
        await unfollowUser({ targetUserId: detail.owner.userId })
      } else {
        await followUser({ targetUserId: detail.owner.userId })
      }
    } catch (error) {
      console.error(error)
      setFollowedOverride(followed)
    } finally {
      setFollowPending(false)
    }
  }

  const handlePostComment = async () => {
    if (!comment.trim() || postingComment || !isSignedIn) {
      return
    }

    setPostingComment(true)

    try {
      await addComment({
        content: comment.trim(),
        parentId: null,
        targetId: String(detail.project._id),
        targetType: 'project',
      })
      setComment('')
      await queryClient.invalidateQueries({
        queryKey: projectDetailQueryOptions(fullName).queryKey,
      })
    } catch (error) {
      console.error(error)
    } finally {
      setPostingComment(false)
    }
  }

  const stats = [
    {
      accent: false,
      fill: false,
      icon: Star,
      label: 'github stars',
      value: compactNumber(githubStars),
    },
    {
      accent: true,
      fill: liked,
      icon: Heart,
      label: 'locatic likes',
      value: compactNumber(locaticLikes),
    },
    {
      accent: false,
      fill: false,
      icon: MessageSquare,
      label: 'comments',
      value: String(detail.project.locatic.commentsCount),
    },
  ]

  return (
    <div className="lx-page-shell flex flex-col bg-canvas">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas px-[var(--lx-gutter)] py-3">
        <button
          onClick={() => {
            if (canGoBack) {
              router.history.back()
            } else {
              void router.navigate({ to: isSignedIn ? '/home' : '/' })
            }
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-transparent px-2 py-2 font-mono text-[12px] text-text-muted transition-colors hover:text-text"
          type="button"
        >
          <ArrowLeft size={14} /> back
        </button>

        <div className="flex flex-wrap gap-2">
          {!isOwnProject && (
            <Button
              variant="monoOutline"
              size="meta"
              onClick={() => void openConversation(String(detail.owner.userId))}
              disabled={pendingUserId === String(detail.owner.userId)}
              className="font-mono"
            >
              {pendingUserId === String(detail.owner.userId)
                ? 'opening…'
                : 'message'}
            </Button>
          )}
          <Button
            variant={liked ? 'brand' : 'monoOutline'}
            size="meta"
            onClick={() => void handleLike()}
            disabled={likePending || !isSignedIn}
            className="font-mono"
          >
            <Heart
              size={13}
              fill={liked ? 'currentColor' : 'none'}
              strokeWidth={1.6}
            />
            {liked ? 'liked' : 'like'}
          </Button>
          <Button
            variant="monoOutline"
            size="meta"
            onClick={() => void handleFollow()}
            disabled={followPending || !isSignedIn}
            className="font-mono"
          >
            {followPending ? 'working…' : followed ? 'following' : 'follow'}
          </Button>
          <Button
            variant="monoOutline"
            size="meta"
            asChild
            className="font-mono"
          >
            <a href={githubHref} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={12} /> github
            </a>
          </Button>
        </div>
      </div>

      <div className="lx-page-scroll flex-1">
        <div className="lx-page-width-detail pt-2">
          <div className="mb-4 font-mono text-[11.5px] text-text-faint">
            <span className="text-text-muted">{owner}</span>
            <span className="mx-1.5">/</span>
            {repo}
          </div>

          <h1 className="mb-3 font-mono text-[clamp(28px,4vw,40px)] font-bold tracking-[-0.025em] text-text">
            <span className="font-normal text-text-faint">{owner}/</span>
            {repo}
          </h1>

          <p className="mb-6 max-w-[680px] font-sans text-base leading-[1.55] text-text-muted">
            {description}
          </p>

          <div className="mb-7 flex flex-wrap items-center gap-6 border-b border-line pb-6">
            {stats.map((stat) => (
              <div key={stat.label}>
                <div className="flex items-baseline gap-1.5">
                  <stat.icon
                    size={14}
                    strokeWidth={1.4}
                    fill={stat.fill ? 'currentColor' : 'none'}
                    className={stat.accent ? 'text-brand' : 'text-text-muted'}
                  />
                  <span className="font-mono text-[22px] font-semibold tracking-[-0.02em] text-text [font-variant-numeric:tabular-nums]">
                    {stat.value}
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-[10.5px] lowercase text-text-faint">
                  {stat.label}
                </div>
              </div>
            ))}

            <div className="flex w-full flex-wrap items-center gap-2.5 font-mono text-[11.5px] text-text-faint">
              {detail.project.github.primaryLanguage && (
                <LangDot
                  lang={detail.project.github.primaryLanguage}
                  showLabel
                />
              )}
              <span>
                updated {relativeTime(detail.project.github.lastCommitAt)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div>
              <div className="mb-8 overflow-hidden rounded-[6px] border border-line bg-surface">
                <div className="flex items-center justify-between border-b border-line bg-surface-alt px-4 py-2.5 font-mono text-[11.5px]">
                  <span className="text-text-muted">README.md</span>
                  <a
                    href={`${githubHref}#readme`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-text-faint no-underline"
                  >
                    <ExternalLink size={11} /> view on github
                  </a>
                </div>
                <div className="flex flex-col gap-3.5 px-7 py-6">
                  {readmePreview.split('\n\n').map((block, index) => {
                    if (block.startsWith('# ')) {
                      return (
                        <h1
                          key={index}
                          className="m-0 font-mono text-[22px] font-bold tracking-[-0.02em] text-text"
                        >
                          {block.slice(2)}
                        </h1>
                      )
                    }

                    if (block.startsWith('## ')) {
                      return (
                        <h2
                          key={index}
                          className="mt-2 border-b border-line pb-1.5 font-mono text-sm font-semibold text-text-muted"
                        >
                          {block.slice(3)}
                        </h2>
                      )
                    }

                    if (block.startsWith('`')) {
                      return (
                        <pre
                          key={index}
                          className="m-0 overflow-x-auto whitespace-pre-wrap rounded bg-canvas px-3.5 py-3 font-mono text-[12.5px] leading-[1.6] text-text"
                        >
                          {block.replace(/`/g, '')}
                        </pre>
                      )
                    }

                    return (
                      <p
                        key={index}
                        className="m-0 font-sans text-sm leading-[1.65] text-text-muted"
                      >
                        {block}
                      </p>
                    )
                  })}
                </div>
              </div>

              <div>
                <div className="mb-3.5 font-mono text-[11px] uppercase tracking-[0.06em] text-text-faint">
                  // comments · {detail.project.locatic.commentsCount}
                </div>

                {isSignedIn ? (
                  <div className="mb-4 flex flex-wrap gap-3 rounded-[6px] border border-line bg-surface px-[14px] py-3">
                    <Textarea
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder="say something thoughtful…"
                      rows={2}
                      className="min-h-[72px] flex-1 resize-none border-0 bg-transparent px-0 py-0 font-sans text-[13.5px] text-text shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    <Button
                      variant="brand"
                      size="meta"
                      onClick={() => void handlePostComment()}
                      disabled={!comment.trim() || postingComment}
                      className="self-end font-mono font-semibold"
                    >
                      {postingComment ? '…' : 'post'}
                    </Button>
                  </div>
                ) : (
                  <div className="mb-4 rounded-[6px] border border-line bg-surface px-[14px] py-3 font-mono text-[12.5px] text-text-faint">
                    <a href="/sign-in" className="text-brand no-underline">
                      sign in
                    </a>{' '}
                    to leave a comment.
                  </div>
                )}

                {comments.length === 0 ? (
                  <div className="py-4 font-sans text-sm text-text-muted">
                    no comments yet.
                  </div>
                ) : (
                  comments.map((commentItem) => (
                    <div
                      key={String(commentItem._id)}
                      className="flex gap-3 border-t border-line py-[14px]"
                    >
                      <LxAvatar
                        name={commentItem.authorSnapshot.displayName}
                        avatarUrl={commentItem.authorSnapshot.avatarUrl}
                        size={32}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
                          <span className="font-mono text-[12.5px] font-semibold text-text">
                            {commentItem.authorSnapshot.displayName}
                          </span>
                          {commentItem.authorSnapshot.cityName && (
                            <CityPill
                              city={commentItem.authorSnapshot.cityName}
                            />
                          )}
                          <span className="font-mono text-[11px] text-text-faint">
                            {relativeTime(commentItem.createdAt)}
                          </span>
                        </div>
                        <p className="m-0 font-sans text-[13.5px] leading-[1.6] text-text">
                          {commentItem.content}
                        </p>
                        <div className="mt-2 flex gap-3 font-mono text-[11px] text-text-faint">
                          <span>{commentItem.likesCount} likes</span>
                          <span>{commentItem.replyCount} replies</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <aside className="flex flex-col gap-5">
              <div className="rounded-[6px] border border-line bg-surface p-[18px]">
                <button
                  type="button"
                  onClick={() =>
                    void router.navigate({
                      to: '/u/$username',
                      params: {
                        username: detail.owner.githubUsername,
                      } as never,
                    } as never)
                  }
                  className="mb-3.5 flex w-full items-center gap-3 border-0 bg-transparent p-0 text-left"
                >
                  <LxAvatar
                    name={detail.owner.displayName}
                    avatarUrl={detail.owner.avatarUrl}
                    size={48}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm font-semibold text-text">
                      {detail.owner.displayName}
                    </div>
                    <div className="font-mono text-[11.5px] text-text-faint">
                      @{detail.owner.githubUsername}
                    </div>
                  </div>
                </button>

                <div className="mb-3.5 flex flex-col gap-2.5">
                  <StatusPill status={detail.owner.buildStatus} size="md" />
                  {detail.owner.city && <CityPill city={detail.owner.city} />}
                </div>

                <div className="flex flex-wrap gap-2.5 font-mono text-[11.5px]">
                  {ownerGithubHref && (
                    <a
                      href={ownerGithubHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-muted no-underline"
                    >
                      github
                    </a>
                  )}
                  {ownerXHref && (
                    <a
                      href={ownerXHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-muted no-underline"
                    >
                      x
                    </a>
                  )}
                  {ownerLinkedinHref && (
                    <a
                      href={ownerLinkedinHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-muted no-underline"
                    >
                      linkedin
                    </a>
                  )}
                  {ownerWebsiteHref && (
                    <a
                      href={ownerWebsiteHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-muted no-underline"
                    >
                      site
                    </a>
                  )}
                </div>
              </div>

              <div className="rounded-[6px] border border-line bg-surface p-[18px]">
                <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.06em] text-text-faint">
                  recent updates
                </div>

                {detail.updates.length === 0 ? (
                  <div className="font-sans text-[13px] text-text-muted">
                    no updates yet.
                  </div>
                ) : (
                  detail.updates.slice(0, 4).map((update) => (
                    <div
                      key={String(update._id)}
                      className="mt-3 border-t border-line pt-3"
                    >
                      <div className="mb-1 font-mono text-xs font-semibold text-text">
                        {update.versionTag ? `${update.versionTag} · ` : ''}
                        {update.title}
                      </div>
                      <div className="font-sans text-[12.5px] leading-[1.5] text-text-muted">
                        {update.description}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
