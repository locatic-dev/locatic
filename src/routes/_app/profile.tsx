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
    return (
      <div style={{ padding: 32, color: 'var(--lx-text-3)' }}>loading…</div>
    )
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div
          style={{
            padding: '40px 48px 28px',
            borderBottom: '1px solid var(--lx-border)',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
            <LxAvatar
              name={profile.viewer.displayName}
              avatarUrl={profile.viewer.avatarUrl}
              size={88}
            />
            <div style={{ flex: 1, paddingTop: 4 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                <h1
                  style={{
                    margin: 0,
                    fontFamily: 'var(--lx-font-mono)',
                    fontSize: 30,
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                    color: 'var(--lx-text)',
                  }}
                >
                  {profile.viewer.displayName}
                </h1>
                <StatusPill status={profile.viewer.buildStatus} size="md" />
              </div>
              <div
                style={{
                  fontFamily: 'var(--lx-font-mono)',
                  fontSize: 13,
                  color: 'var(--lx-text-3)',
                  marginBottom: 14,
                }}
              >
                <span>@{profile.viewer.githubUsername}</span>
                {profile.viewer.cityName && (
                  <span> · {profile.viewer.cityName}</span>
                )}
              </div>
              {profile.viewer.bio && (
                <p
                  style={{
                    margin: '0 0 16px',
                    maxWidth: 540,
                    fontFamily: 'var(--lx-font-sans)',
                    fontSize: 14,
                    color: 'var(--lx-text-2)',
                    lineHeight: 1.6,
                  }}
                >
                  {profile.viewer.bio}
                </p>
              )}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 18,
                  fontFamily: 'var(--lx-font-mono)',
                  fontSize: 12,
                  flexWrap: 'wrap',
                }}
              >
                <span>
                  <strong style={{ color: 'var(--lx-text)' }}>
                    {compactNumber(profile.viewer.stats.followersCount)}
                  </strong>{' '}
                  <span style={{ color: 'var(--lx-text-3)' }}>followers</span>
                </span>
                <span>
                  <strong style={{ color: 'var(--lx-text)' }}>
                    {compactNumber(profile.viewer.stats.followingCount)}
                  </strong>{' '}
                  <span style={{ color: 'var(--lx-text-3)' }}>following</span>
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    gap: 10,
                    marginLeft: 6,
                    color: 'var(--lx-text-3)',
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
            <Button
              variant="outline"
              onClick={() =>
                void navigate({ to: '/settings', search: {} as never } as never)
              }
              style={{
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 12.5,
                flexShrink: 0,
              }}
            >
              edit profile
            </Button>
          </div>

          <div style={{ marginTop: 28 }}>
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
        </div>

        <div
          style={{
            padding: '0 48px',
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid var(--lx-border)',
          }}
        >
          {tabs.map((tabItem) => (
            <button
              key={tabItem.id}
              onClick={() =>
                void navigate({
                  to: '/profile',
                  search: { tab: tabItem.id } as never,
                } as never)
              }
              style={{
                padding: '14px 16px',
                position: 'relative',
                cursor: 'pointer',
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 12.5,
                color:
                  tab === tabItem.id ? 'var(--lx-text)' : 'var(--lx-text-3)',
                fontWeight: tab === tabItem.id ? 600 : 400,
                background: 'none',
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
              }}
              type="button"
            >
              {tabItem.label}
              <span
                style={{
                  fontSize: 10.5,
                  padding: '1px 6px',
                  borderRadius: 8,
                  background: 'var(--lx-surface-alt)',
                  color: 'var(--lx-text-3)',
                  lineHeight: 1.3,
                }}
              >
                {tabItem.count}
              </span>
              {tab === tabItem.id && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: -1,
                    left: 12,
                    right: 12,
                    height: 2,
                    background: 'var(--lx-accent)',
                  }}
                />
              )}
            </button>
          ))}
        </div>

        <div style={{ padding: '28px 48px 80px' }}>
          {tab === 'projects' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
  )
}
