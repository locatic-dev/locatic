import { Link, useRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Bookmark, Star, Heart, MessageSquare, X, GitFork } from '@/lib/icons'
import { formatDate, relativeTime } from '@/lib/time'
import { LxAvatar } from './lx-avatar'
import { LanguageBar } from './language-bar'
import { CityPill } from './city-pill'
import { StatusPill, isCollaborationStatus } from './status-pill'
import { Button } from './button'
import { cardVariants } from './card'
import { cn } from '@/lib/utils'

/** Most recent public activity (`latestUpdate` on project previews). */
export type ProjectLatestUpdate = {
  kind: 'release' | 'post' | 'repo'
  at: number
  label?: string
} | null

/**
 * Metadata sync state, separate from activity (`syncStatus` on previews).
 * `at` is the last successful sync; `failed` and `error` reach owners only.
 */
export type ProjectSyncStatus = {
  kind: 'fresh' | 'stale' | 'failed' | 'never'
  at: number | null
  hasReadme: boolean
  error?: string
}

export interface ProjectCardData {
  id?: string
  owner: string
  repo: string
  fullName?: string
  description?: string | null
  lang?: string | null
  languages?: Array<{ name: string; bytes: number }>
  /** Legacy push age, shown only when `latestUpdate` is not provided. */
  lastCommitLabel?: string
  latestUpdate?: ProjectLatestUpdate
  syncStatus?: ProjectSyncStatus
  githubStars: number
  locaticLikes: number
  reactionCounts?: Record<string, number>
  viewerReactionTypes?: string[]
  commentsCount: number
  postsCount?: number
  topics?: string[]
  forksCount?: number
  authorName: string
  authorHandle: string
  authorAvatarUrl?: string | null
  city?: string | null
  /** Set only for exact-city owners; the city pill then links to the city page. */
  cityId?: string | null
  buildStatus?: string | null
  liked?: boolean
  followed?: boolean
  isPinned?: boolean
}

type ProjectCardProjectLink = {
  owner: string
  repo: string
  search?: {
    comment?: string
    post?: string
  }
  hash?: string
}

type ProjectCardAuthorLink = {
  username: string
  search?: {
    tab: 'projects'
  }
}

interface ProjectCardProps {
  project: ProjectCardData
  density?: 'cozy' | 'compact'
  authorPlacement?: 'header' | 'footer'
  projectLink?: ProjectCardProjectLink
  authorLink?: ProjectCardAuthorLink
  onLike?: () => void
  onComment?: () => void
  onDM?: () => void
  onFollow?: () => void
  onDismiss?: () => void
  /** Owner-only: re-runs a failed metadata refresh. */
  onRetrySync?: () => void
  /** Signed-in viewers only; visitors get a sign-in link from the caller. */
  onToggleSave?: () => void
  /** Whether the viewer has saved this project (plan item D1). */
  saved?: boolean
  savePending?: boolean
  likePending?: boolean
  followPending?: boolean
  dmPending?: boolean
  retrySyncPending?: boolean
  className?: string
  showActions?: boolean
  showFullCity?: boolean
  topLeftSlot?: ReactNode
  reactionSlot?: ReactNode
}

const ACTIVITY_RELATIVE_LIMIT_MS = 28 * 24 * 60 * 60 * 1000

/** "3d ago" for the last four weeks, then the calendar date. */
export function formatActivityAge(at: number, now = Date.now()) {
  return now - at < ACTIVITY_RELATIVE_LIMIT_MS
    ? relativeTime(at)
    : formatDate(at)
}

/** "released v1.2 · 3d ago", "posted · 2h ago" or "pushed · 5d ago". */
export function describeLatestUpdate(update: NonNullable<ProjectLatestUpdate>) {
  const age = formatActivityAge(update.at)
  switch (update.kind) {
    case 'release':
      return update.label
        ? `released ${update.label} · ${age}`
        : `released · ${age}`
    case 'post':
      return `posted · ${age}`
    case 'repo':
    default:
      return `pushed · ${age}`
  }
}

/**
 * Freshness a visitor sees: when the data was last updated from GitHub and
 * whether a README exists. A failed refresh is reported separately (owners).
 */
export function describeSyncFreshness(status: ProjectSyncStatus) {
  const parts: string[] = []
  if (status.at === null) {
    parts.push('not synced yet')
  } else {
    parts.push(
      `${status.kind === 'stale' ? 'last updated' : 'updated'} ${formatActivityAge(status.at)}`,
    )
  }
  if (!status.hasReadme) {
    parts.push('no README')
  }
  return parts.join(' · ')
}

function commentActionLabel(count: number) {
  if (count <= 0) return 'start the conversation'
  return `${count.toLocaleString()} ${count === 1 ? 'comment' : 'comments'}`
}

// The title link stretches over the card (the one tab stop that opens the
// project); every other control sits above it so it stays its own target.
const coverLinkClassName =
  'after:absolute after:inset-0 after:rounded-card focus-visible:outline-none'
const coverFocusClassName =
  'has-[[data-card-cover]:focus-visible]:outline-2 has-[[data-card-cover]:focus-visible]:outline-focus has-[[data-card-cover]:focus-visible]:-outline-offset-2'
const aboveCover = 'relative z-10'

export function ProjectCard({
  project,
  density = 'cozy',
  authorPlacement = 'header',
  projectLink,
  authorLink,
  onLike,
  onComment,
  onDM,
  onFollow,
  onDismiss,
  onRetrySync,
  onToggleSave,
  saved = false,
  savePending,
  likePending,
  followPending,
  dmPending,
  retrySyncPending,
  className,
  showActions = true,
  showFullCity = false,
  topLeftSlot,
  reactionSlot,
}: ProjectCardProps) {
  const router = useRouter()
  const compact = density === 'compact'
  const authorLabel = project.authorName || project.authorHandle
  const languages =
    project.languages && project.languages.length > 0
      ? project.languages
      : project.lang
        ? [{ name: project.lang, bytes: 0 }]
        : []
  const projectNavigateOptions = projectLink
    ? {
        to: '/project/$owner/$repo' as const,
        params: { owner: projectLink.owner, repo: projectLink.repo },
        ...(projectLink.search ? { search: projectLink.search } : {}),
        hash: projectLink.hash,
      }
    : null
  const projectLabel = project.fullName ?? `${project.owner}/${project.repo}`
  const latestUpdateLabel = project.latestUpdate
    ? describeLatestUpdate(project.latestUpdate)
    : project.latestUpdate === undefined && project.lastCommitLabel
      ? `pushed · ${project.lastCommitLabel}`
      : null
  const syncFailed = project.syncStatus?.kind === 'failed'
  const freshnessLabel =
    project.syncStatus && !syncFailed
      ? describeSyncFreshness(project.syncStatus)
      : null
  const collaborationStatus = isCollaborationStatus(project.buildStatus)
    ? project.buildStatus
    : null
  const commentLabel = commentActionLabel(project.commentsCount)
  const showLike = showActions && !reactionSlot && Boolean(onLike)
  const hasActions =
    showActions && Boolean(onFollow || onDM || onToggleSave || showLike)

  const preloadProjectRoute = () => {
    if (!projectNavigateOptions) return
    void router.preloadRoute(projectNavigateOptions)
  }

  const avatar = (
    <LxAvatar
      name={project.authorHandle}
      avatarUrl={project.authorAvatarUrl}
      size={22}
    />
  )
  const authorName = (
    <span className="min-w-0 font-sans text-label font-medium text-text wrap-anywhere">
      {authorLabel}
    </span>
  )
  const authorIdentity = authorLink ? (
    <Link
      to="/u/$username"
      params={{ username: authorLink.username }}
      search={authorLink.search ?? { tab: 'projects' }}
      preload="intent"
      aria-label={`Open ${authorLabel}'s profile`}
      className={cn(
        aboveCover,
        'flex min-h-11 min-w-0 items-center gap-2 rounded-control py-2 text-left transition-colors hover:text-text',
      )}
    >
      {avatar}
      {authorName}
    </Link>
  ) : (
    <div className="flex min-h-11 min-w-0 items-center gap-2 py-2">
      {avatar}
      {authorName}
    </div>
  )
  const cityPill = project.city ? (
    <CityPill
      city={project.city}
      cityId={project.cityId ?? null}
      truncate={!showFullCity}
      className={cn(aboveCover, 'max-w-full')}
    />
  ) : null
  const identityRow = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      {authorIdentity}
      {cityPill}
      {collaborationStatus && <StatusPill status={collaborationStatus} />}
    </div>
  )

  const commentAction = onComment ? (
    <button
      type="button"
      onClick={onComment}
      className={cn(
        aboveCover,
        'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-control px-2 font-mono text-label text-text-muted transition-colors hover:text-text',
      )}
    >
      <MessageSquare size={13} strokeWidth={1.5} aria-hidden="true" />
      {commentLabel}
    </button>
  ) : projectLink ? (
    <Link
      to="/project/$owner/$repo"
      params={{ owner: projectLink.owner, repo: projectLink.repo }}
      hash="comments"
      className={cn(
        aboveCover,
        'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-control px-2 font-mono text-label text-text-muted no-underline transition-colors hover:text-text',
      )}
    >
      <MessageSquare size={13} strokeWidth={1.5} aria-hidden="true" />
      {commentLabel}
    </Link>
  ) : project.commentsCount > 0 ? (
    <span className="inline-flex items-center gap-1.5 font-mono text-label text-text-faint">
      <MessageSquare size={13} strokeWidth={1.5} aria-hidden="true" />
      {commentLabel}
    </span>
  ) : null

  return (
    <div
      onFocus={preloadProjectRoute}
      onPointerEnter={preloadProjectRoute}
      onTouchStart={preloadProjectRoute}
      className={cn(
        cardVariants({ density: compact ? 'compact' : 'cozy' }),
        '@container relative flex flex-col',
        compact ? 'gap-2' : 'gap-3',
        projectNavigateOptions && ['lx-card', coverFocusClassName],
        className,
      )}
    >
      {topLeftSlot && (
        <div className={cn(aboveCover, 'flex min-w-0 items-center')}>
          {topLeftSlot}
        </div>
      )}

      <div className="flex items-start gap-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {authorPlacement === 'header' && identityRow}
          {projectLink ? (
            <Link
              to="/project/$owner/$repo"
              params={{ owner: projectLink.owner, repo: projectLink.repo }}
              search={projectLink.search}
              hash={projectLink.hash}
              preload="intent"
              data-card-cover=""
              className={cn(
                coverLinkClassName,
                'max-w-full text-left text-title leading-snug text-text no-underline wrap-anywhere',
              )}
            >
              <span className="font-normal text-text-faint">
                {project.owner}/
              </span>
              {project.repo}
            </Link>
          ) : (
            <p className="m-0 max-w-full text-title leading-snug text-text wrap-anywhere">
              <span className="font-normal text-text-faint">
                {project.owner}/
              </span>
              {project.repo}
            </p>
          )}

          {project.description && (
            <p
              className={cn(
                'm-0 text-body text-text-muted wrap-anywhere',
                compact ? 'line-clamp-1' : 'line-clamp-2',
              )}
            >
              {project.description}
            </p>
          )}
        </div>

        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label={`Dismiss ${projectLabel}`}
            className={cn(
              aboveCover,
              '-mt-2 -mr-3 -mb-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control text-text-faint transition-colors hover:text-text',
            )}
            type="button"
          >
            <X size={12} aria-hidden="true" />
          </button>
        )}
      </div>

      {(latestUpdateLabel || freshnessLabel) && (
        <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-meta">
          {latestUpdateLabel && (
            <span className="text-text-muted">{latestUpdateLabel}</span>
          )}
          {freshnessLabel && (
            <span className="text-text-faint">{freshnessLabel}</span>
          )}
        </p>
      )}

      {syncFailed && (
        <div
          role="status"
          className={cn(
            aboveCover,
            'flex flex-wrap items-center gap-x-3 gap-y-1 text-meta',
          )}
        >
          <span className="min-w-0 text-danger wrap-anywhere">
            last refresh failed
            {project.syncStatus?.error ? `: ${project.syncStatus.error}` : ''}
          </span>
          {onRetrySync && (
            <Button size="sm" onClick={onRetrySync} disabled={retrySyncPending}>
              {retrySyncPending ? 'retrying…' : 'retry'}
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-label text-text-faint">
          {project.topics?.slice(0, 3).map((topic) => (
            <span
              key={topic}
              className="rounded-control border border-line px-1.5 py-0.5 text-meta text-text-muted"
            >
              #{topic}
            </span>
          ))}
          {project.githubStars > 0 && (
            <span className="inline-flex items-center gap-1">
              <Star size={11} strokeWidth={1.4} aria-hidden="true" />
              <span className="sr-only">GitHub stars:</span>
              {project.githubStars.toLocaleString()}
            </span>
          )}
          {project.forksCount !== undefined && project.forksCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <GitFork size={11} strokeWidth={1.4} aria-hidden="true" />
              <span className="sr-only">forks:</span>
              {project.forksCount.toLocaleString()}
            </span>
          )}
          {project.postsCount !== undefined && project.postsCount > 0 && (
            <span>
              {project.postsCount.toLocaleString()}{' '}
              {project.postsCount === 1 ? 'post' : 'posts'}
            </span>
          )}
        </div>

        {!compact && languages.length > 0 && (
          <LanguageBar languages={languages} />
        )}
      </div>

      {(authorPlacement === 'footer' ||
        reactionSlot ||
        commentAction ||
        hasActions) && (
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-2 border-t border-line',
            compact ? 'pt-2' : 'pt-3',
          )}
        >
          {authorPlacement === 'footer' && (
            <div className="flex min-w-0 basis-full">{identityRow}</div>
          )}

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {reactionSlot && <div className={aboveCover}>{reactionSlot}</div>}
            {commentAction}
          </div>

          {hasActions && (
            <div
              className={cn(
                aboveCover,
                'ml-auto flex shrink-0 flex-wrap items-center gap-1.5',
              )}
            >
              {onFollow && (
                <Button
                  size="touch"
                  onClick={onFollow}
                  disabled={followPending}
                >
                  {project.followed ? 'following' : 'follow'}
                </Button>
              )}
              {onDM && (
                <Button
                  size="touch"
                  variant="ghost"
                  onClick={onDM}
                  disabled={dmPending}
                >
                  {dmPending ? 'opening…' : 'message'}
                </Button>
              )}
              {onToggleSave && (
                <Button
                  size="touch"
                  variant="ghost"
                  onClick={onToggleSave}
                  disabled={savePending}
                >
                  <Bookmark
                    size={14}
                    strokeWidth={1.6}
                    fill={saved ? 'currentColor' : 'none'}
                    aria-hidden="true"
                  />
                  {saved ? 'saved' : 'save'}
                </Button>
              )}
              {showLike && (
                <button
                  onClick={onLike}
                  disabled={likePending}
                  aria-label={
                    project.locaticLikes > 0
                      ? `like, ${project.locaticLikes} ${project.locaticLikes === 1 ? 'like' : 'likes'}`
                      : 'like'
                  }
                  aria-pressed={Boolean(project.liked)}
                  className={cn(
                    'flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-control px-2.5 font-mono text-label transition-colors',
                    project.liked ? 'text-liked' : 'text-text-faint',
                    likePending
                      ? 'cursor-default opacity-60'
                      : 'cursor-pointer hover:text-liked',
                  )}
                  type="button"
                >
                  <Heart
                    size={16}
                    strokeWidth={1.6}
                    fill={project.liked ? 'currentColor' : 'none'}
                    aria-hidden="true"
                  />
                  {project.locaticLikes > 0 &&
                    project.locaticLikes.toLocaleString()}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
