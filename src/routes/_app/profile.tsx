import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { Doc } from '../../../convex/_generated/dataModel'
import { privateProfileQueryOptions } from '@/features/profile/queries'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { StatusPill } from '@/components/ui/status-pill'
import { BrandIcon } from '@/components/ui/brand-icon'
import { ContributionGraph } from '@/components/ui/contribution-graph'
import { Button } from '@/components/ui/button'
import { compactNumber } from '@/lib/format'
import { relativeTime } from '@/lib/time'
import { ProjectCard, type ProjectCardData } from '@/components/ui/project-card'
import {
  mapPrivateProfile,
  type PrivateProfilePayload,
} from '@/features/contracts'
import { socialLinkHref } from '@/lib/social-links'

export const Route = createFileRoute('/_app/profile')({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as 'projects' | 'comments' | 'liked') ?? 'projects',
  }),
  component: ProfilePage,
})

function projectCardData(project: Doc<'projects'>): ProjectCardData {
  const owner = project.github.fullName.split('/')[0] ?? ''
  return {
    id: String(project._id),
    owner,
    repo: project.github.name,
    fullName: project.github.fullName,
    description: project.github.description,
    lang: project.github.primaryLanguage,
    lastCommitLabel: relativeTime(project.github.lastCommitAt),
    githubStars: project.github.stargazersCount,
    locaticLikes: project.locatic.likesCount,
    commentsCount: project.locatic.commentsCount,
    authorName: project.ownerSnapshot.displayName,
    authorHandle: owner,
    authorAvatarUrl: project.ownerSnapshot.avatarUrl,
    city: project.ownerSnapshot.cityName,
  }
}

function ProfilePage() {
  const { tab } = useSearch({ from: '/_app/profile' })
  const navigate = useNavigate()
  const profileQuery = useQuery(privateProfileQueryOptions())
  const profile = mapPrivateProfile(
    profileQuery.data as PrivateProfilePayload | undefined,
  )

  if (!profile) {
    return <div className="p-8 text-text-faint">loading…</div>
  }

  const githubHref = socialLinkHref('github', profile.viewer.githubUsername)
  const xHref = socialLinkHref('x', profile.viewer.socialLinks.x)
  const linkedinHref = socialLinkHref(
    'linkedin',
    profile.viewer.socialLinks.linkedin,
  )
  const websiteHref = socialLinkHref(
    'website',
    profile.viewer.socialLinks.website,
  )

  const tabs = [
    {
      id: 'projects',
      label: 'projects',
      count: profile.projects.length,
    },
    {
      id: 'comments',
      label: 'comments',
      count: profile.comments.filter((comment) => !comment.isDeleted).length,
    },
    {
      id: 'liked',
      label: 'liked',
      count: profile.likedProjects.length,
    },
  ] as const

  return (
    <div className="lx-page-shell">
      <div className="lx-page-scroll" style={{ flex: 1 }}>
        <div className="lx-page-width-detail">
          <div className="relative border-b border-line py-8 pb-7">
            <div className="flex flex-col items-start gap-6">
              <LxAvatar
                name={profile.viewer.displayName}
                avatarUrl={profile.viewer.avatarUrl}
                size={88}
              />
              <div className="flex-1 pt-1">
                <div className="mb-2 flex items-center gap-3">
                  <h1 className="m-0 font-mono text-[30px] font-bold tracking-[-0.02em] text-text">
                    {profile.viewer.displayName}
                  </h1>
                  <StatusPill status={profile.viewer.buildStatus} size="md" />
                </div>
                <div className="mb-3.5 font-mono text-[13px] text-text-faint">
                  <span>@{profile.viewer.githubUsername}</span>
                  {profile.viewer.cityName && (
                    <span> · {profile.viewer.cityName}</span>
                  )}
                </div>
                {profile.viewer.bio && (
                  <p className="mb-4 max-w-[540px] font-sans text-sm leading-6 text-text-muted">
                    {profile.viewer.bio}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-[18px] font-mono text-xs">
                  <span>
                    <strong className="text-text">
                      {compactNumber(profile.viewer.stats.followersCount)}
                    </strong>{' '}
                    <span className="text-text-faint">followers</span>
                  </span>
                  <span>
                    <strong className="text-text">
                      {compactNumber(profile.viewer.stats.followingCount)}
                    </strong>{' '}
                    <span className="text-text-faint">following</span>
                  </span>
                  <span className="ml-1.5 inline-flex gap-2.5 text-text-faint">
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
              <Button
                variant="outline"
                onClick={() =>
                  void navigate({
                    to: '/settings',
                    search: {} as never,
                  } as never)
                }
                style={{
                  fontFamily: 'var(--lx-font-mono)',
                  fontSize: 12.5,
                  flexShrink: 0,
                }}
                className="min-h-11"
              >
                edit profile
              </Button>
            </div>

            <div className="mt-7">
              <div className="mb-2.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-faint">
                contributions this year
              </div>
              <div className="overflow-x-auto">
                <ContributionGraph />
              </div>
            </div>
          </div>

          <div className="flex items-center overflow-x-auto border-b border-line px-0">
            {tabs.map((tabItem) => (
              <button
                key={tabItem.id}
                onClick={() =>
                  void navigate({
                    to: '/profile',
                    search: { tab: tabItem.id } as never,
                  } as never)
                }
                className={`relative inline-flex items-center gap-[7px] px-4 py-3.5 font-mono text-[12.5px] ${
                  tab === tabItem.id
                    ? 'font-semibold text-text'
                    : 'text-text-faint'
                }`}
                type="button"
              >
                {tabItem.label}
                <span className="rounded-pill bg-surface-alt px-1.5 py-px text-[10.5px] leading-[1.3] text-text-faint">
                  {tabItem.count}
                </span>
                {tab === tabItem.id && (
                  <div className="absolute -bottom-px left-3 right-3 h-0.5 bg-brand" />
                )}
              </button>
            ))}
          </div>

          <div className="pt-7">
            {tab === 'projects' && (
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
              >
                {profile.projects.length === 0 && (
                  <div
                    style={{
                      fontFamily: 'var(--lx-font-mono)',
                      fontSize: 12,
                      color: 'var(--lx-text-3)',
                    }}
                  >
                    no projects imported yet.
                  </div>
                )}
                {profile.projects.map((project) => {
                  const owner = project.github.fullName.split('/')[0] ?? ''
                  const repo = project.github.name

                  return (
                    <ProjectCard
                      key={String(project._id)}
                      project={projectCardData(project)}
                      showActions={false}
                      onCardClick={() =>
                        void navigate({
                          to: '/project/$owner/$repo',
                          params: { owner, repo } as never,
                        } as never)
                      }
                    />
                  )
                })}
              </div>
            )}

            {tab === 'comments' && (
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                {profile.comments
                  .filter((comment) => !comment.isDeleted)
                  .map((comment) => (
                    <div
                      key={String(comment._id)}
                      style={{
                        border: '1px solid var(--lx-border)',
                        borderRadius: 6,
                        background: 'var(--lx-surface)',
                        padding: '16px 18px',
                      }}
                    >
                      <div
                        style={{
                          fontFamily: 'var(--lx-font-mono)',
                          fontSize: 11,
                          color: 'var(--lx-text-3)',
                          marginBottom: 8,
                        }}
                      >
                        {comment.targetType} · {relativeTime(comment.createdAt)}
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
                  ))}
                {profile.comments.filter((comment) => !comment.isDeleted)
                  .length === 0 && (
                  <div
                    style={{
                      fontFamily: 'var(--lx-font-mono)',
                      fontSize: 12,
                      color: 'var(--lx-text-3)',
                    }}
                  >
                    no comments yet.
                  </div>
                )}
              </div>
            )}

            {tab === 'liked' && (
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
              >
                {profile.likedProjects.length === 0 && (
                  <div
                    style={{
                      fontFamily: 'var(--lx-font-mono)',
                      fontSize: 12,
                      color: 'var(--lx-text-3)',
                    }}
                  >
                    no liked projects yet.
                  </div>
                )}
                {profile.likedProjects.map((likedProject) => {
                  const owner =
                    likedProject.project.github.fullName.split('/')[0] ?? ''
                  const repo = likedProject.project.github.name

                  return (
                    <ProjectCard
                      key={String(likedProject.projectId)}
                      project={{
                        ...projectCardData(likedProject.project),
                        liked: true,
                      }}
                      showActions={false}
                      onCardClick={() =>
                        void navigate({
                          to: '/project/$owner/$repo',
                          params: { owner, repo } as never,
                        } as never)
                      }
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
