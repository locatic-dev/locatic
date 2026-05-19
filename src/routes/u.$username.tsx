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
        <div className="mb-8 flex flex-col items-start gap-6">
          <LxAvatar
            name={profile.profile.displayName}
            avatarUrl={profile.profile.avatarUrl}
            size={88}
          />

          <div className="flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h1 className="m-0 font-mono text-[28px] font-bold tracking-[-0.02em] text-text">
                {profile.profile.displayName}
              </h1>
              <StatusPill status={profile.profile.buildStatus} size="md" />
            </div>

            <div className="mb-3 font-mono text-[13px] text-text-faint">
              @{profile.githubUsername}
              {profile.profile.city && <span> · {profile.profile.city}</span>}
            </div>

            {profile.profile.bio && (
              <p className="mb-4 max-w-[520px] font-sans text-sm leading-6 text-text-muted">
                {profile.profile.bio}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4 font-mono text-xs">
              <span>
                <strong className="text-text">
                  {compactNumber(profile.stats.followersCount)}
                </strong>{' '}
                <span className="text-text-faint">followers</span>
              </span>
              <span>
                <strong className="text-text">
                  {compactNumber(profile.stats.followingCount)}
                </strong>{' '}
                <span className="text-text-faint">following</span>
              </span>
              <span className="ml-1.5 inline-flex items-center gap-2.5 text-text-faint">
                {githubHref && (
                  <a
                    href={githubHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-inherit"
                  >
                    <BrandIcon name="github" size={14} />
                  </a>
                )}
                {xHref && (
                  <a
                    href={xHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-inherit"
                  >
                    <BrandIcon name="twitter" size={14} />
                  </a>
                )}
                {linkedinHref && (
                  <a
                    href={linkedinHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-inherit"
                  >
                    <BrandIcon name="linkedin" size={14} />
                  </a>
                )}
                {blueskyHref && (
                  <a
                    href={blueskyHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-inherit no-underline"
                  >
                    bsky
                  </a>
                )}
                {websiteHref && (
                  <a
                    href={websiteHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-inherit no-underline"
                  >
                    site
                  </a>
                )}
              </span>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <div className="mb-2.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-faint">
            contributions this year
          </div>
          <div className="overflow-x-auto">
            <ContributionGraph />
          </div>
        </div>

        <div className="lx-inline-tabs mb-[22px] flex flex-wrap gap-2.5 overflow-x-auto border-b border-line">
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
              className={`inline-flex gap-1.5 border-0 border-b bg-transparent pb-2.5 font-mono text-xs ${
                tab === tabItem.id
                  ? 'border-brand text-text'
                  : 'border-transparent text-text-faint'
              }`}
              type="button"
            >
              <span>{tabItem.label}</span>
              <span className="text-text-faint">{tabItem.count}</span>
            </button>
          ))}
        </div>

        {tab === 'projects' && (
          <div className="flex flex-col gap-3.5">
            {profile.projects.length === 0 ? (
              <div className="py-[18px] font-sans text-sm text-text-muted">
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
          <div className="flex flex-col gap-3.5">
            {profile.privacy.commentHistoryVisibility !== 'public' ? (
              <div className="py-[18px] font-sans text-sm text-text-muted">
                comment history is private on this profile.
              </div>
            ) : sortedComments.length === 0 ? (
              <div className="py-[18px] font-sans text-sm text-text-muted">
                no public comments yet.
              </div>
            ) : (
              sortedComments.map((comment) => (
                <div
                  key={String(comment._id)}
                  className="rounded-[6px] border border-line bg-surface px-[18px] py-4"
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2.5">
                    <span className="font-mono text-[11.5px] text-text-faint">
                      {comment.targetType} comment
                    </span>
                    <span className="font-mono text-[11px] text-text-faint">
                      {relativeTime(comment.createdAt)}
                    </span>
                  </div>
                  <p className="m-0 font-sans text-[13.5px] leading-[1.6] text-text">
                    {comment.content}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'liked' && (
          <div className="flex flex-col gap-3">
            {profile.privacy.likedProjectsVisibility !== 'public' ? (
              <div className="py-[18px] font-sans text-sm text-text-muted">
                liked projects are private on this profile.
              </div>
            ) : profile.likedProjects.length === 0 ? (
              <div className="py-[18px] font-sans text-sm text-text-muted">
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
                    className="rounded-[6px] border border-line bg-surface px-4 py-[14px] text-left"
                    type="button"
                  >
                    <div className="mb-1 font-mono text-[13px] font-semibold text-text">
                      {project.fullName}
                    </div>
                    <div className="font-mono text-[11px] text-text-faint">
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
