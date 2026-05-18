import { useAuth } from '@clerk/tanstack-react-start'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import {
  Link,
  createFileRoute,
  useNavigate,
  useSearch,
} from '@tanstack/react-router'
import type { Doc } from '../../convex/_generated/dataModel'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { StatusPill } from '@/components/ui/status-pill'
import { BrandIcon } from '@/components/ui/brand-icon'
import { ContributionGraph } from '@/components/ui/contribution-graph'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { compactNumber } from '@/lib/format'
import { relativeTime } from '@/lib/time'
import { ProjectCard, type ProjectCardData } from '@/components/ui/project-card'
import {
  mapPublicProfile,
  mapViewerBootstrap,
  type PublicProfilePayload,
  type ViewerBootstrapPayload,
} from '@/features/contracts'
import { publicProfileQueryOptions } from '@/features/profile/queries'
import { socialLinkHref } from '@/lib/social-links'
import { useFollowUser, useUnfollowUser } from '@/features/follows/mutations'
import { viewerQueryOptions } from '@/features/viewer/queries'
import { useOpenConversation } from '@/features/inbox/use-open-conversation'

export const Route = createFileRoute('/u/$username')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (['projects', 'comments', 'liked'].includes(search.tab as string)
      ? search.tab
      : 'projects') as 'projects' | 'comments' | 'liked',
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      publicProfileQueryOptions(params.username),
    ),
  component: PublicProfilePage,
})

function projectCardData(project: Doc<'projects'>): ProjectCardData {
  const owner = project.github.fullName.split('/')[0] ?? ''
  return {
    authorAvatarUrl: project.ownerSnapshot.avatarUrl,
    authorHandle: owner,
    authorName: project.ownerSnapshot.displayName,
    city: project.ownerSnapshot.cityName,
    commentsCount: project.locatic.commentsCount,
    description: project.github.description,
    fullName: project.github.fullName,
    githubStars: project.github.stargazersCount,
    id: String(project._id),
    lang: project.github.primaryLanguage,
    lastCommitLabel: relativeTime(project.github.lastCommitAt),
    locaticLikes: project.locatic.likesCount,
    owner,
    repo: project.github.name,
  }
}

function PublicProfilePage() {
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()
  const { username } = Route.useParams()
  const { tab } = useSearch({ from: '/u/$username' })
  const profileQuery = useQuery(publicProfileQueryOptions(username))
  const viewerQuery = useQuery(viewerQueryOptions())
  const viewerBootstrap = mapViewerBootstrap(
    viewerQuery.data as ViewerBootstrapPayload | undefined,
  )
  const profile = mapPublicProfile(
    profileQuery.data as PublicProfilePayload | null | undefined,
  )
  const followUser = useFollowUser()
  const unfollowUser = useUnfollowUser()
  const { openConversation, pendingUserId } = useOpenConversation()
  const [followOverride, setFollowOverride] = useState<boolean | null>(null)
  const [followPending, setFollowPending] = useState(false)

  if (!profile && profileQuery.isLoading) {
    return (
      <div className="min-h-dvh bg-canvas">
        <header className="flex h-14 items-center border-b border-line px-8">
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            <Logo size={20} />
            <span className="font-mono text-sm font-bold text-text">
              locatic
            </span>
          </Link>
        </header>
        <div className="p-8 text-text-faint">loading profile…</div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-dvh bg-canvas">
        <header className="flex h-14 items-center border-b border-line px-8">
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            <Logo size={20} />
            <span className="font-mono text-sm font-bold text-text">
              locatic
            </span>
          </Link>
        </header>
        <div className="px-8 py-10 text-text-muted">
          profile not found or not publicly available.
        </div>
      </div>
    )
  }

  const isOwnProfile =
    viewerBootstrap?.viewer?.githubUsername === profile.githubUsername
  const followed = followOverride ?? profile.viewerFollowsProfile
  const githubHref = socialLinkHref('github', profile.githubUsername)
  const xHref = socialLinkHref('x', profile.profile.socialLinks.x)
  const linkedinHref = socialLinkHref(
    'linkedin',
    profile.profile.socialLinks.linkedin,
  )
  const blueskyHref = socialLinkHref(
    'bluesky',
    profile.profile.socialLinks.bluesky,
  )
  const websiteHref = socialLinkHref(
    'website',
    profile.profile.socialLinks.website,
  )

  const handleFollow = async () => {
    if (followPending || isOwnProfile) {
      return
    }

    setFollowPending(true)
    setFollowOverride(!followed)

    try {
      if (followed) {
        await unfollowUser({ targetUserId: profile.userId })
      } else {
        await followUser({ targetUserId: profile.userId })
      }
    } catch (error) {
      console.error(error)
      setFollowOverride(followed)
    } finally {
      setFollowPending(false)
    }
  }

  const tabs = [
    {
      count: profile.projects.length,
      id: 'projects',
      label: 'projects',
    },
    {
      count: profile.comments.length,
      id: 'comments',
      label: 'comments',
    },
    {
      count: profile.likedProjects.length,
      id: 'liked',
      label: 'liked',
    },
  ] as const

  const sortedComments = [...profile.comments].sort(
    (left, right) => right.createdAt - left.createdAt,
  )

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-line px-[var(--lx-gutter)] py-3">
        <Link to="/" className="flex items-center gap-2.5 no-underline">
          <Logo size={20} />
          <span className="font-mono text-sm font-bold text-text">locatic</span>
        </Link>

        {isOwnProfile ? (
          <Button
            variant="outline"
            onClick={() =>
              void navigate({ to: '/profile', search: {} as never } as never)
            }
            className="min-h-11 font-mono text-[12px]"
          >
            your profile
          </Button>
        ) : isSignedIn ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => void openConversation(profile.userId)}
              disabled={pendingUserId === profile.userId}
              className="min-h-11 font-mono text-[12px]"
            >
              {pendingUserId === profile.userId ? 'opening…' : 'message'}
            </Button>
            <Button
              variant={followed ? 'outline' : 'default'}
              onClick={() => void handleFollow()}
              disabled={followPending}
              className={
                followed
                  ? 'min-h-11 font-mono text-[12px]'
                  : 'min-h-11 font-mono text-[12px] font-semibold'
              }
            >
              {followPending ? 'working…' : followed ? 'following' : 'follow'}
            </Button>
          </div>
        ) : (
          <Link
            to="/sign-in"
            className="font-mono text-[12.5px] text-primary no-underline"
          >
            sign in
          </Link>
        )}
      </header>

      <div className="lx-page-width-detail py-8 pb-20">
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 24,
            marginBottom: 32,
            flexDirection: 'column',
          }}
        >
          <LxAvatar
            name={profile.profile.displayName}
            avatarUrl={profile.profile.avatarUrl}
            size={88}
          />

          <div style={{ flex: 1 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 8,
                flexWrap: 'wrap',
              }}
            >
              <h1
                style={{
                  margin: 0,
                  fontFamily: 'var(--lx-font-mono)',
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: 'var(--lx-text)',
                }}
              >
                {profile.profile.displayName}
              </h1>
              <StatusPill status={profile.profile.buildStatus} size="md" />
            </div>

            <div
              style={{
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 13,
                color: 'var(--lx-text-3)',
                marginBottom: 12,
              }}
            >
              @{profile.githubUsername}
              {profile.profile.city && <span> · {profile.profile.city}</span>}
            </div>

            {profile.profile.bio && (
              <p
                style={{
                  margin: '0 0 16px',
                  maxWidth: 520,
                  fontFamily: 'var(--lx-font-sans)',
                  fontSize: 14,
                  color: 'var(--lx-text-2)',
                  lineHeight: 1.6,
                }}
              >
                {profile.profile.bio}
              </p>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 12,
                flexWrap: 'wrap',
              }}
            >
              <span>
                <strong style={{ color: 'var(--lx-text)' }}>
                  {compactNumber(profile.stats.followersCount)}
                </strong>{' '}
                <span style={{ color: 'var(--lx-text-3)' }}>followers</span>
              </span>
              <span>
                <strong style={{ color: 'var(--lx-text)' }}>
                  {compactNumber(profile.stats.followingCount)}
                </strong>{' '}
                <span style={{ color: 'var(--lx-text-3)' }}>following</span>
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  gap: 10,
                  marginLeft: 6,
                  color: 'var(--lx-text-3)',
                  alignItems: 'center',
                }}
              >
                {githubHref && (
                  <a
                    href={githubHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'inherit' }}
                  >
                    <BrandIcon name="github" size={14} />
                  </a>
                )}
                {xHref && (
                  <a
                    href={xHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'inherit' }}
                  >
                    <BrandIcon name="twitter" size={14} />
                  </a>
                )}
                {linkedinHref && (
                  <a
                    href={linkedinHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'inherit' }}
                  >
                    <BrandIcon name="linkedin" size={14} />
                  </a>
                )}
                {blueskyHref && (
                  <a
                    href={blueskyHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'inherit',
                      textDecoration: 'none',
                      fontSize: 11,
                    }}
                  >
                    bsky
                  </a>
                )}
                {websiteHref && (
                  <a
                    href={websiteHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'inherit',
                      textDecoration: 'none',
                      fontSize: 11,
                    }}
                  >
                    site
                  </a>
                )}
              </span>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              fontFamily: 'var(--lx-font-mono)',
              fontSize: 10.5,
              color: 'var(--lx-text-3)',
              marginBottom: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            contributions this year
          </div>
          <div style={{ overflowX: 'auto' }}>
            <ContributionGraph />
          </div>
        </div>

        <div
          className="lx-inline-tabs"
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 22,
            borderBottom: '1px solid var(--lx-border)',
            overflowX: 'auto',
          }}
        >
          {tabs.map((tabItem) => (
            <button
              key={tabItem.id}
              onClick={() =>
                void navigate({
                  to: '/u/$username',
                  params: { username } as never,
                  search: { tab: tabItem.id } as never,
                } as never)
              }
              style={{
                border: 'none',
                borderBottom:
                  tab === tabItem.id
                    ? '1px solid var(--lx-accent)'
                    : '1px solid transparent',
                background: 'transparent',
                color:
                  tab === tabItem.id ? 'var(--lx-text)' : 'var(--lx-text-3)',
                padding: '0 0 10px',
                cursor: 'pointer',
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 12,
                display: 'inline-flex',
                gap: 6,
              }}
              type="button"
            >
              <span>{tabItem.label}</span>
              <span style={{ color: 'var(--lx-text-3)' }}>{tabItem.count}</span>
            </button>
          ))}
        </div>

        {tab === 'projects' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {profile.projects.length === 0 ? (
              <div
                style={{
                  padding: '18px 0',
                  fontFamily: 'var(--lx-font-sans)',
                  fontSize: 14,
                  color: 'var(--lx-text-2)',
                }}
              >
                no public projects yet.
              </div>
            ) : (
              profile.projects.map((project) => {
                const owner = project.github.fullName.split('/')[0] ?? username
                const repo = project.github.name

                return (
                  <ProjectCard
                    key={String(project._id)}
                    project={projectCardData(project)}
                    onAuthorClick={() =>
                      void navigate({
                        to: '/u/$username',
                        params: { username: owner } as never,
                      } as never)
                    }
                    onCardClick={() =>
                      void navigate({
                        to: '/project/$owner/$repo',
                        params: { owner, repo } as never,
                      } as never)
                    }
                    showActions={false}
                  />
                )
              })
            )}
          </div>
        )}

        {tab === 'comments' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {profile.privacy.commentHistoryVisibility !== 'public' ? (
              <div
                style={{
                  padding: '18px 0',
                  fontFamily: 'var(--lx-font-sans)',
                  fontSize: 14,
                  color: 'var(--lx-text-2)',
                }}
              >
                comment history is private on this profile.
              </div>
            ) : sortedComments.length === 0 ? (
              <div
                style={{
                  padding: '18px 0',
                  fontFamily: 'var(--lx-font-sans)',
                  fontSize: 14,
                  color: 'var(--lx-text-2)',
                }}
              >
                no public comments yet.
              </div>
            ) : (
              sortedComments.map((comment) => (
                <div
                  key={String(comment._id)}
                  style={{
                    padding: '16px 18px',
                    border: '1px solid var(--lx-border)',
                    borderRadius: 6,
                    background: 'var(--lx-surface)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      marginBottom: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--lx-font-mono)',
                        fontSize: 11.5,
                        color: 'var(--lx-text-3)',
                      }}
                    >
                      {comment.targetType} comment
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--lx-font-mono)',
                        fontSize: 11,
                        color: 'var(--lx-text-3)',
                      }}
                    >
                      {relativeTime(comment.createdAt)}
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
                    {comment.content}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'liked' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {profile.privacy.likedProjectsVisibility !== 'public' ? (
              <div
                style={{
                  padding: '18px 0',
                  fontFamily: 'var(--lx-font-sans)',
                  fontSize: 14,
                  color: 'var(--lx-text-2)',
                }}
              >
                liked projects are private on this profile.
              </div>
            ) : profile.likedProjects.length === 0 ? (
              <div
                style={{
                  padding: '18px 0',
                  fontFamily: 'var(--lx-font-sans)',
                  fontSize: 14,
                  color: 'var(--lx-text-2)',
                }}
              >
                no public likes yet.
              </div>
            ) : (
              profile.likedProjects.map((project) => {
                const [owner, repo] = project.fullName.split('/')
                return (
                  <button
                    key={String(project.reactionId)}
                    onClick={() =>
                      void navigate({
                        to: '/project/$owner/$repo',
                        params: {
                          owner: owner ?? profile.githubUsername,
                          repo: repo ?? project.name,
                        } as never,
                      } as never)
                    }
                    style={{
                      padding: '14px 16px',
                      border: '1px solid var(--lx-border)',
                      borderRadius: 6,
                      background: 'var(--lx-surface)',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                    type="button"
                  >
                    <div
                      style={{
                        fontFamily: 'var(--lx-font-mono)',
                        fontSize: 13,
                        color: 'var(--lx-text)',
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      {project.fullName}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--lx-font-mono)',
                        fontSize: 11,
                        color: 'var(--lx-text-3)',
                      }}
                    >
                      liked {relativeTime(project.likedAt)}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
