import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { Doc } from '../../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { LocationPill } from '@/components/ui/city-pill'
import { ContributionGraph } from '@/components/ui/contribution-graph'
import { EmptyState } from '@/components/ui/empty-state'
import { LanguageBar } from '@/components/ui/language-bar'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { SocialLinks } from '@/components/ui/social-links'
import { StatusPill } from '@/components/ui/status-pill'
import type { ProfilePostPreview } from '@/features/contracts'
import { ProfileContentSkeleton } from '@/features/profile/content-skeleton'
import { ProfilePostList } from '@/features/profile/post-list'
import {
  PublicProfileProjectsList,
  type ProfileProjectRetrySync,
} from '@/features/profile/public-profile-projects-list'
import {
  summarizeProfileLanguages,
  type ProfileNetworkTab,
} from '@/features/profile/state'
import type {
  ProfileLocation,
  ProfileShowcaseProject,
} from '@/features/profile/types'
import { compactNumber } from '@/lib/format'

// Shared sections of the public profile (/u/$username) and the own profile
// (/profile). Both routes render them in this order:
// identity, bio, actions, pinned projects, recent work, contribution graph
// and languages, then network and the full activity tabs.

type GithubContributions = Doc<'users'>['githubContributions'] | null
type ProfileSocialLinks = Doc<'users'>['profile']['socialLinks']

function pluralize(count: number, singular: string, plural: string) {
  return `${compactNumber(count)} ${count === 1 ? singular : plural}`
}

export function ProfileMeta({
  followersCount,
  followingCount,
  githubUsername,
  onSelectNetwork,
  socialLinks,
}: {
  followersCount: number
  followingCount: number
  githubUsername: string
  /** Present when the follow graph is visible: counts jump to the list. */
  onSelectNetwork?: (tab: ProfileNetworkTab) => void
  socialLinks: ProfileSocialLinks
}) {
  const counts = [
    {
      tab: 'followers' as const,
      text: pluralize(followersCount, 'follower', 'followers'),
    },
    {
      tab: 'following' as const,
      text: `${compactNumber(followingCount)} following`,
    },
  ]

  return (
    <div className="flex flex-wrap items-center gap-x-4 text-label text-text-muted">
      {counts.map((count) =>
        onSelectNetwork ? (
          <button
            key={count.tab}
            type="button"
            onClick={() => onSelectNetwork(count.tab)}
            className="h-8 bg-transparent text-left text-label text-text-muted transition-colors hover:text-text pointer-coarse:min-h-11"
          >
            {count.text}
          </button>
        ) : (
          <span
            key={count.tab}
            className="inline-flex h-8 items-center pointer-coarse:min-h-11"
          >
            {count.text}
          </span>
        ),
      )}
      <SocialLinks githubUsername={githubUsername} links={socialLinks} />
    </div>
  )
}

/**
 * Identity, bio, counts and links, then the page's actions. The display name
 * is the page's h1.
 */
export function ProfileHeader({
  actions,
  avatarUrl,
  bio,
  buildStatus,
  displayName,
  githubUsername,
  location,
  meta,
}: {
  actions: ReactNode
  avatarUrl: string | null
  bio: string
  buildStatus: Doc<'users'>['profile']['buildStatus']
  displayName: string
  githubUsername: string
  location: ProfileLocation
  meta: ReactNode
}) {
  const trimmedBio = bio.trim()

  return (
    <header className="flex flex-col gap-4">
      <div className="flex min-w-0 items-start gap-4">
        <LxAvatar
          name={displayName}
          avatarUrl={avatarUrl}
          size={64}
          eager
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-display text-text wrap-anywhere">
            {displayName}
          </h1>
          <p className="m-0 mt-1 font-mono text-meta text-text-muted">
            @{githubUsername}
          </p>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
            <LocationPill location={location} />
            <StatusPill status={buildStatus} size="md" />
          </div>
        </div>
      </div>
      {trimmedBio && (
        <p className="m-0 max-w-prose text-body text-text-muted wrap-anywhere">
          {trimmedBio}
        </p>
      )}
      {meta}
      <div className="lx-stack-actions">{actions}</div>
    </header>
  )
}

export function ProfileSection({
  children,
  description,
  id,
  title,
}: {
  children: ReactNode
  description?: string
  id: string
  title: string
}) {
  const headingId = `${id}-heading`

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="min-w-0 border-t border-line pt-5"
    >
      <div className="mb-3 min-w-0">
        <h2 id={headingId} className="m-0 text-eyebrow text-text-muted">
          {title}
        </h2>
        {description && (
          <p className="m-0 mt-0.5 text-meta text-text-muted">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

type RenderProjectAction = (project: ProfileShowcaseProject) => ReactNode

/**
 * Pinned projects. Renders nothing when there are none and no `emptyContent`
 * is given (visitors never see an empty block).
 */
export function ProfilePinnedSection({
  emptyContent,
  loading = false,
  projects,
  renderProjectAction,
  retrySync,
}: {
  emptyContent?: ReactNode
  loading?: boolean
  projects: ProfileShowcaseProject[]
  renderProjectAction?: RenderProjectAction
  retrySync?: ProfileProjectRetrySync
}) {
  if (!loading && projects.length === 0 && !emptyContent) {
    return null
  }

  return (
    <ProfileSection id="profile-pinned" title="pinned">
      {loading ? (
        <ProfileContentSkeleton />
      ) : projects.length === 0 ? (
        emptyContent
      ) : (
        <PublicProfileProjectsList
          projects={projects}
          renderTopLeftSlot={renderProjectAction}
          retrySync={retrySync}
        />
      )}
    </ProfileSection>
  )
}

/** Latest projects and posts, bounded by the profile payload. */
export function ProfileRecentWorkSection({
  loading = false,
  posts,
  projects,
  reactionsDisabled,
  renderProjectAction,
  retrySync,
}: {
  loading?: boolean
  posts: ProfilePostPreview[]
  projects: ProfileShowcaseProject[]
  reactionsDisabled: boolean
  renderProjectAction?: RenderProjectAction
  retrySync?: ProfileProjectRetrySync
}) {
  const isEmpty = projects.length === 0 && posts.length === 0

  return (
    <ProfileSection
      id="profile-recent-work"
      title="recent work"
      description="latest projects and posts"
    >
      {loading ? (
        <ProfileContentSkeleton />
      ) : isEmpty ? (
        <EmptyState
          size="compact"
          headingLevel={3}
          title="no public work yet."
        />
      ) : (
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          {projects.length > 0 && (
            <div className="min-w-0">
              <h3 className="m-0 mb-2 text-eyebrow text-text-muted">
                projects
              </h3>
              <PublicProfileProjectsList
                projects={projects}
                renderTopLeftSlot={renderProjectAction}
                retrySync={retrySync}
              />
            </div>
          )}
          {posts.length > 0 && (
            <div className="min-w-0">
              <h3 className="m-0 mb-2 text-eyebrow text-text-muted">posts</h3>
              <ProfilePostList
                posts={posts}
                emptyLabel="no public posts yet."
                reactionsDisabled={reactionsDisabled}
              />
            </div>
          )}
        </div>
      )}
    </ProfileSection>
  )
}

export function ProfileContributionSection({
  githubContributions,
  loading = false,
}: {
  githubContributions: GithubContributions
  loading?: boolean
}) {
  const total = githubContributions?.totalContributions

  return (
    <ProfileSection
      id="profile-contribution-graph"
      title="github contributions"
      description={
        total != null
          ? `${total.toLocaleString()} contributions this year`
          : 'contributions this year'
      }
    >
      <ContributionGraph
        weeks={githubContributions?.weeks ?? undefined}
        totalContributions={total ?? undefined}
        loading={loading && !githubContributions}
        unavailable={
          !loading &&
          (!githubContributions?.weeks ||
            githubContributions.weeks.length === 0)
        }
      />
    </ProfileSection>
  )
}

/** Languages across the pinned and recent projects; nothing when unknown. */
export function ProfileLanguagesSection({
  projects,
}: {
  projects: ProfileShowcaseProject[]
}) {
  const languages = summarizeProfileLanguages(
    projects.map((project) => ({
      projectId: String(project.projectId),
      languages: project.languages,
    })),
  )

  if (languages.length === 0) {
    return null
  }

  return (
    <ProfileSection
      id="profile-languages"
      title="languages"
      description="across pinned and recent projects"
    >
      <LanguageBar languages={languages} />
    </ProfileSection>
  )
}

/** Visitors get a sign-up path instead of follow and message. */
export function ProfileSignUpCta({
  displayName,
  redirect,
}: {
  displayName: string
  redirect: string | undefined
}) {
  return (
    <>
      <Button asChild variant="primary" size="touch">
        <Link to="/sign-up/$" search={{ redirect }}>
          sign up to follow
        </Link>
      </Button>
      <p className="m-0 self-center text-label text-text-muted">
        join locatic to follow {displayName} or send a message.
      </p>
    </>
  )
}

/** Follow (with unfollow undo handled by the caller) and message. */
export function ProfileSocialActions({
  following,
  followPending,
  messagePending,
  onMessage,
  onToggleFollow,
}: {
  following: boolean
  followPending: boolean
  messagePending: boolean
  onMessage: () => void
  onToggleFollow: () => void
}) {
  return (
    <>
      <Button
        variant={following ? 'secondary' : 'primary'}
        size="touch"
        onClick={onToggleFollow}
        disabled={followPending}
        aria-pressed={following}
      >
        {followPending ? 'working…' : following ? 'following' : 'follow'}
      </Button>
      <Button size="touch" onClick={onMessage} disabled={messagePending}>
        {messagePending ? 'opening…' : 'message'}
      </Button>
    </>
  )
}

/**
 * The last band: network (first in reading order, a side column on wide
 * screens) and the full activity tabs.
 */
export function ProfileNetworkAndActivity({
  activity,
  network,
}: {
  activity: ReactNode
  network: ReactNode
}) {
  return (
    <div className="grid min-w-0 gap-8 border-t border-line pt-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(280px,0.95fr)]">
      <aside className="min-w-0 lg:order-last">
        <div className="lg:sticky lg:top-6">{network}</div>
      </aside>
      <section aria-labelledby="profile-activity-heading" className="min-w-0">
        <h2
          id="profile-activity-heading"
          className="m-0 mb-2 text-eyebrow text-text-muted"
        >
          all activity
        </h2>
        {activity}
      </section>
    </div>
  )
}
