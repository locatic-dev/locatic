import { useAuth } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
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
  type ProjectDetailPayload,
} from '@/features/contracts'
import { socialLinkHref } from '@/lib/social-links'

export const Route = createFileRoute('/_app/project/$owner/$repo')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      projectDetailQueryOptions(`${params.owner}/${params.repo}`),
    ),
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { owner, repo } = Route.useParams()
  const navigate = useNavigate()
  const { isSignedIn } = useAuth()
  const likeProject = useLikeProject()
  const unlikeProject = useUnlikeProject()
  const addComment = useAddComment()
  const followUser = useFollowUser()
  const unfollowUser = useUnfollowUser()

  const fullName = `${owner}/${repo}`
  const projectQuery = useQuery(projectDetailQueryOptions(fullName))
  const detail = mapProjectDetail(
    projectQuery.data as ProjectDetailPayload | null | undefined,
  )

  const [comment, setComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [likePending, setLikePending] = useState(false)
  const [followPending, setFollowPending] = useState(false)
  const [likedOverride, setLikedOverride] = useState<boolean | null>(null)
  const [followedOverride, setFollowedOverride] = useState<boolean | null>(null)

  if (!detail && projectQuery.isLoading) {
    return (
      <div style={{ padding: 32, color: 'var(--lx-text-3)' }}>
        loading project…
      </div>
    )
  }

  if (!detail) {
    return (
      <div style={{ padding: 32, color: 'var(--lx-text-2)' }}>
        project not found.
      </div>
    )
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
      await projectQuery.refetch()
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100dvh',
        background: 'var(--lx-bg)',
      }}
    >
      <div
        style={{
          height: 52,
          borderBottom: '1px solid var(--lx-border)',
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          background: 'var(--lx-bg)',
        }}
      >
        <button
          onClick={() =>
            void navigate({
              to: isSignedIn ? '/home' : '/',
              search: {} as never,
            } as never)
          }
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'none',
            border: 'none',
            color: 'var(--lx-text-2)',
            fontFamily: 'var(--lx-font-mono)',
            fontSize: 12,
            cursor: 'pointer',
          }}
          type="button"
        >
          <ArrowLeft size={14} /> back
        </button>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            onClick={() => void handleLike()}
            disabled={likePending || !isSignedIn}
            style={{
              background: liked ? 'var(--lx-accent)' : 'var(--lx-surface)',
              color: liked ? '#0d1117' : 'var(--lx-text)',
              border: '1px solid var(--lx-border)',
              fontFamily: 'var(--lx-font-mono)',
              fontSize: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Heart
              size={13}
              fill={liked ? 'currentColor' : 'none'}
              strokeWidth={1.6}
            />
            {liked ? 'liked' : 'like'}
          </Button>
          <Button
            variant="outline"
            onClick={() => void handleFollow()}
            disabled={followPending || !isSignedIn}
            style={{ fontFamily: 'var(--lx-font-mono)', fontSize: 12 }}
          >
            {followPending ? 'working…' : followed ? 'following' : 'follow'}
          </Button>
          <Button
            variant="outline"
            asChild
            style={{
              fontFamily: 'var(--lx-font-mono)',
              fontSize: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <a href={githubHref} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={12} /> github
            </a>
          </Button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div
          style={{
            maxWidth: 1040,
            margin: '0 auto',
            padding: '32px 32px 80px',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--lx-font-mono)',
              fontSize: 11.5,
              color: 'var(--lx-text-3)',
              marginBottom: 16,
            }}
          >
            <span style={{ color: 'var(--lx-text-2)' }}>{owner}</span>
            <span style={{ margin: '0 6px' }}>/</span>
            {repo}
          </div>

          <h1
            style={{
              margin: '0 0 12px',
              fontFamily: 'var(--lx-font-mono)',
              fontSize: 'clamp(28px, 4vw, 40px)',
              fontWeight: 700,
              letterSpacing: '-0.025em',
              color: 'var(--lx-text)',
            }}
          >
            <span style={{ color: 'var(--lx-text-3)', fontWeight: 400 }}>
              {owner}/
            </span>
            {repo}
          </h1>

          <p
            style={{
              margin: '0 0 24px',
              fontFamily: 'var(--lx-font-sans)',
              fontSize: 16,
              color: 'var(--lx-text-2)',
              lineHeight: 1.55,
              maxWidth: 680,
            }}
          >
            {description}
          </p>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 24,
              paddingBottom: 24,
              borderBottom: '1px solid var(--lx-border)',
              marginBottom: 28,
              flexWrap: 'wrap',
            }}
          >
            {stats.map((stat) => (
              <div key={stat.label}>
                <div
                  style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}
                >
                  <stat.icon
                    size={14}
                    strokeWidth={1.4}
                    fill={stat.fill ? 'currentColor' : 'none'}
                    style={{
                      color: stat.accent
                        ? 'var(--lx-accent)'
                        : 'var(--lx-text-2)',
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--lx-font-mono)',
                      fontSize: 22,
                      fontWeight: 600,
                      color: 'var(--lx-text)',
                      letterSpacing: '-0.02em',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {stat.value}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: 'var(--lx-font-mono)',
                    fontSize: 10.5,
                    color: 'var(--lx-text-3)',
                    marginTop: 2,
                    textTransform: 'lowercase',
                  }}
                >
                  {stat.label}
                </div>
              </div>
            ))}

            <div
              style={{
                marginLeft: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 11.5,
                color: 'var(--lx-text-3)',
                flexWrap: 'wrap',
              }}
            >
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

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 280px',
              gap: 32,
            }}
          >
            <div>
              <div
                style={{
                  border: '1px solid var(--lx-border)',
                  borderRadius: 6,
                  background: 'var(--lx-surface)',
                  overflow: 'hidden',
                  marginBottom: 32,
                }}
              >
                <div
                  style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--lx-border)',
                    background: 'var(--lx-surface-alt)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontFamily: 'var(--lx-font-mono)',
                    fontSize: 11.5,
                  }}
                >
                  <span style={{ color: 'var(--lx-text-2)' }}>README.md</span>
                  <a
                    href={`${githubHref}#readme`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'var(--lx-text-3)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <ExternalLink size={11} /> view on github
                  </a>
                </div>
                <div
                  style={{
                    padding: '24px 28px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                  }}
                >
                  {readmePreview.split('\n\n').map((block, index) => {
                    if (block.startsWith('# ')) {
                      return (
                        <h1
                          key={index}
                          style={{
                            margin: 0,
                            fontFamily: 'var(--lx-font-mono)',
                            fontSize: 22,
                            fontWeight: 700,
                            color: 'var(--lx-text)',
                            letterSpacing: '-0.02em',
                          }}
                        >
                          {block.slice(2)}
                        </h1>
                      )
                    }

                    if (block.startsWith('## ')) {
                      return (
                        <h2
                          key={index}
                          style={{
                            margin: '8px 0 0',
                            fontFamily: 'var(--lx-font-mono)',
                            fontSize: 14,
                            fontWeight: 600,
                            color: 'var(--lx-text-2)',
                            paddingBottom: 6,
                            borderBottom: '1px solid var(--lx-border)',
                          }}
                        >
                          {block.slice(3)}
                        </h2>
                      )
                    }

                    if (block.startsWith('`')) {
                      return (
                        <pre
                          key={index}
                          style={{
                            margin: 0,
                            padding: '12px 14px',
                            background: 'var(--lx-bg)',
                            borderRadius: 4,
                            border: '1px solid var(--lx-border)',
                            fontFamily: 'var(--lx-font-mono)',
                            fontSize: 12.5,
                            color: 'var(--lx-text)',
                            lineHeight: 1.6,
                            whiteSpace: 'pre-wrap',
                            overflowX: 'auto',
                          }}
                        >
                          {block.replace(/`/g, '')}
                        </pre>
                      )
                    }

                    return (
                      <p
                        key={index}
                        style={{
                          margin: 0,
                          fontFamily: 'var(--lx-font-sans)',
                          fontSize: 14,
                          color: 'var(--lx-text-2)',
                          lineHeight: 1.65,
                        }}
                      >
                        {block}
                      </p>
                    )
                  })}
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontFamily: 'var(--lx-font-mono)',
                    fontSize: 11,
                    color: 'var(--lx-text-3)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 14,
                  }}
                >
                  // comments · {detail.project.locatic.commentsCount}
                </div>

                {isSignedIn ? (
                  <div
                    style={{
                      display: 'flex',
                      gap: 12,
                      padding: '12px 14px',
                      border: '1px solid var(--lx-border)',
                      borderRadius: 6,
                      background: 'var(--lx-surface)',
                      marginBottom: 16,
                    }}
                  >
                    <Textarea
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder="say something thoughtful…"
                      rows={2}
                      style={{
                        flex: 1,
                        border: 'none',
                        background: 'transparent',
                        outline: 'none',
                        fontFamily: 'var(--lx-font-sans)',
                        fontSize: 13.5,
                        color: 'var(--lx-text)',
                        resize: 'none',
                        padding: 0,
                      }}
                    />
                    <Button
                      onClick={() => void handlePostComment()}
                      disabled={!comment.trim() || postingComment}
                      style={{
                        background: 'var(--lx-accent)',
                        color: '#0d1117',
                        border: 'none',
                        fontFamily: 'var(--lx-font-mono)',
                        fontSize: 11.5,
                        fontWeight: 600,
                        alignSelf: 'flex-end',
                      }}
                    >
                      {postingComment ? '…' : 'post'}
                    </Button>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '12px 14px',
                      border: '1px solid var(--lx-border)',
                      borderRadius: 6,
                      background: 'var(--lx-surface)',
                      marginBottom: 16,
                      fontFamily: 'var(--lx-font-mono)',
                      fontSize: 12.5,
                      color: 'var(--lx-text-3)',
                    }}
                  >
                    <a href="/sign-in" style={{ color: 'var(--lx-accent)' }}>
                      sign in
                    </a>{' '}
                    to leave a comment.
                  </div>
                )}

                {comments.length === 0 ? (
                  <div
                    style={{
                      padding: '16px 0',
                      fontFamily: 'var(--lx-font-sans)',
                      fontSize: 14,
                      color: 'var(--lx-text-2)',
                    }}
                  >
                    no comments yet.
                  </div>
                ) : (
                  comments.map((commentItem) => (
                    <div
                      key={String(commentItem._id)}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: '14px 0',
                        borderTop: '1px solid var(--lx-border)',
                      }}
                    >
                      <LxAvatar
                        name={commentItem.authorSnapshot.displayName}
                        avatarUrl={commentItem.authorSnapshot.avatarUrl}
                        size={32}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            marginBottom: 6,
                            flexWrap: 'wrap',
                          }}
                        >
                          <span
                            style={{
                              fontFamily: 'var(--lx-font-mono)',
                              fontSize: 12.5,
                              fontWeight: 600,
                              color: 'var(--lx-text)',
                            }}
                          >
                            {commentItem.authorSnapshot.displayName}
                          </span>
                          {commentItem.authorSnapshot.cityName && (
                            <CityPill
                              city={commentItem.authorSnapshot.cityName}
                            />
                          )}
                          <span
                            style={{
                              fontFamily: 'var(--lx-font-mono)',
                              fontSize: 11,
                              color: 'var(--lx-text-3)',
                            }}
                          >
                            {relativeTime(commentItem.createdAt)}
                          </span>
                        </div>
                        <p
                          style={{
                            margin: 0,
                            fontFamily: 'var(--lx-font-sans)',
                            fontSize: 13.5,
                            color: 'var(--lx-text)',
                            lineHeight: 1.6,
                          }}
                        >
                          {commentItem.content}
                        </p>
                        <div
                          style={{
                            marginTop: 8,
                            display: 'flex',
                            gap: 12,
                            fontFamily: 'var(--lx-font-mono)',
                            fontSize: 11,
                            color: 'var(--lx-text-3)',
                          }}
                        >
                          <span>{commentItem.likesCount} likes</span>
                          <span>{commentItem.replyCount} replies</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <aside
              style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
            >
              <div
                style={{
                  padding: 18,
                  borderRadius: 6,
                  border: '1px solid var(--lx-border)',
                  background: 'var(--lx-surface)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 14,
                  }}
                >
                  <LxAvatar
                    name={detail.owner.displayName}
                    avatarUrl={detail.owner.avatarUrl}
                    size={48}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontFamily: 'var(--lx-font-mono)',
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--lx-text)',
                      }}
                    >
                      {detail.owner.displayName}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--lx-font-mono)',
                        fontSize: 11.5,
                        color: 'var(--lx-text-3)',
                      }}
                    >
                      @{detail.owner.githubUsername}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    marginBottom: 14,
                  }}
                >
                  <StatusPill status={detail.owner.buildStatus} size="md" />
                  {detail.owner.city && <CityPill city={detail.owner.city} />}
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    flexWrap: 'wrap',
                    fontFamily: 'var(--lx-font-mono)',
                    fontSize: 11.5,
                  }}
                >
                  {ownerGithubHref && (
                    <a
                      href={ownerGithubHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--lx-text-2)' }}
                    >
                      github
                    </a>
                  )}
                  {ownerXHref && (
                    <a
                      href={ownerXHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--lx-text-2)' }}
                    >
                      x
                    </a>
                  )}
                  {ownerLinkedinHref && (
                    <a
                      href={ownerLinkedinHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--lx-text-2)' }}
                    >
                      linkedin
                    </a>
                  )}
                  {ownerWebsiteHref && (
                    <a
                      href={ownerWebsiteHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--lx-text-2)' }}
                    >
                      site
                    </a>
                  )}
                </div>
              </div>

              <div
                style={{
                  padding: 18,
                  borderRadius: 6,
                  border: '1px solid var(--lx-border)',
                  background: 'var(--lx-surface)',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--lx-font-mono)',
                    fontSize: 11,
                    color: 'var(--lx-text-3)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 12,
                  }}
                >
                  recent updates
                </div>

                {detail.updates.length === 0 ? (
                  <div
                    style={{
                      fontFamily: 'var(--lx-font-sans)',
                      fontSize: 13,
                      color: 'var(--lx-text-2)',
                    }}
                  >
                    no updates yet.
                  </div>
                ) : (
                  detail.updates.slice(0, 4).map((update) => (
                    <div
                      key={String(update._id)}
                      style={{
                        paddingTop: 12,
                        marginTop: 12,
                        borderTop: '1px solid var(--lx-border)',
                      }}
                    >
                      <div
                        style={{
                          fontFamily: 'var(--lx-font-mono)',
                          fontSize: 12,
                          color: 'var(--lx-text)',
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        {update.versionTag ? `${update.versionTag} · ` : ''}
                        {update.title}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--lx-font-sans)',
                          fontSize: 12.5,
                          color: 'var(--lx-text-2)',
                          lineHeight: 1.5,
                        }}
                      >
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
