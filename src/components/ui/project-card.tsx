import { Link, useRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Bookmark, Star, MessageSquare, X, GitFork } from '@/lib/icons'
import { formatDate, relativeTime } from '@/lib/time'
import { LxAvatar } from './lx-avatar'
import { LangDot } from './lang-dot'
import { CityPill } from './city-pill'
import { StatusPill, isCollaborationStatus } from './status-pill'
import { Button } from './button'
import { cardVariants } from './card'
import { cn } from '@/lib/utils'
import { isLive } from '@/lib/builder-activity'
import { useHydratedNow } from '@/lib/use-hydrated-now'

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
  /** The owner city's slug, for the city link (see `CityPill`). */
  citySlug?: string | null
  buildStatus?: string | null
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
  /**
   * `card` (default) is a framed card; `row` is frameless, for a list inside
   * `cardSheetClass`, whose hairlines separate the rows.
   */
  variant?: 'card' | 'row'
  density?: 'cozy' | 'compact'
  /** `none` for lists where every card has the same author (profiles). */
  authorPlacement?: 'header' | 'footer' | 'none'
  projectLink?: ProjectCardProjectLink
  authorLink?: ProjectCardAuthorLink
  onComment?: () => void
  onFollow?: () => void
  onDismiss?: () => void
  /** Owner-only: re-runs a failed metadata refresh. */
  onRetrySync?: () => void
  /** Signed-in viewers only; visitors get a sign-in link from the caller. */
  onToggleSave?: () => void
  /**
   * Trailing actions before follow and save (a visitor's sign-in link, where
   * the caller passes no follow or save handler).
   */
  actionSlot?: ReactNode
  /** Whether the viewer has saved this project. */
  saved?: boolean
  savePending?: boolean
  followPending?: boolean
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
 * The latest update split for the identity line: the kind ("released v1.2 · ")
 * for screen readers, the full label (with the date once it is older than
 * four weeks) for the title, and a relative age ("3mo ago") on screen.
 */
function splitLatestUpdate(
  update: ProjectLatestUpdate | undefined,
  lastCommitLabel: string | undefined,
) {
  if (update) {
    const label = describeLatestUpdate(update)
    const kind = label.slice(
      0,
      label.length - formatActivityAge(update.at).length,
    )
    return { age: relativeTime(update.at), kind, label }
  }
  if (update === undefined && lastCommitLabel) {
    return {
      age: lastCommitLabel,
      kind: 'pushed · ',
      label: `pushed · ${lastCommitLabel}`,
    }
  }
  return null
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
  variant = 'card',
  density = 'cozy',
  authorPlacement = 'header',
  projectLink,
  authorLink,
  onComment,
  onFollow,
  onDismiss,
  onRetrySync,
  onToggleSave,
  actionSlot,
  saved = false,
  savePending,
  followPending,
  retrySyncPending,
  className,
  showActions = true,
  showFullCity = false,
  topLeftSlot,
  reactionSlot,
}: ProjectCardProps) {
  const router = useRouter()
  const compact = density === 'compact'
  const isRow = variant === 'row'
  const authorLabel = project.authorName || project.authorHandle
  const primaryLanguage = project.lang ?? project.languages?.[0]?.name ?? null
  const projectNavigateOptions = projectLink
    ? {
        to: '/project/$owner/$repo' as const,
        params: { owner: projectLink.owner, repo: projectLink.repo },
        ...(projectLink.search ? { search: projectLink.search } : {}),
        hash: projectLink.hash,
      }
    : null
  const projectLabel = project.fullName ?? `${project.owner}/${project.repo}`
  const latestUpdate = splitLatestUpdate(
    project.latestUpdate,
    project.lastCommitLabel,
  )
  // Ages and the live ring depend on the clock, so they render once hydrated
  // (the server's clock differs); their slots keep their height meanwhile.
  const now = useHydratedNow()
  const hasClock = now !== null
  const live = hasClock && isLive(project.latestUpdate?.at, now)
  const syncFailed = project.syncStatus?.kind === 'failed'
  // The row keeps its relative time in the identity line and leaves sync
  // freshness to the project page.
  const freshnessLabel =
    !isRow && project.syncStatus && !syncFailed
      ? describeSyncFreshness(project.syncStatus)
      : null
  const collaborationStatus = isCollaborationStatus(project.buildStatus)
    ? project.buildStatus
    : null
  const commentLabel = commentActionLabel(project.commentsCount)
  const hasActions =
    showActions && Boolean(onFollow || onToggleSave || actionSlot)
  const showAuthorHeader = authorPlacement === 'header'

  const preloadProjectRoute = () => {
    if (!projectNavigateOptions) return
    void router.preloadRoute(projectNavigateOptions)
  }

  const avatar = (
    <span
      title={live ? 'active in the last 24h' : undefined}
      className={cn(
        'inline-flex shrink-0 rounded-full',
        live && 'ring-2 ring-live ring-offset-2 ring-offset-surface',
      )}
    >
      <LxAvatar
        name={project.authorHandle}
        avatarUrl={project.authorAvatarUrl}
        size={32}
      />
    </span>
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
        'flex min-w-0 items-center gap-2.5 rounded-control text-left transition-colors hover:text-text pointer-coarse:min-h-11',
      )}
    >
      {avatar}
      {authorName}
    </Link>
  ) : (
    <div className="flex min-w-0 items-center gap-2.5">
      {avatar}
      {authorName}
    </div>
  )
  const separator = (
    <span aria-hidden="true" className="shrink-0 text-meta text-text-muted">
      ·
    </span>
  )
  const showAge = showAuthorHeader && Boolean(latestUpdate)
  // Place and age form one unit that never wraps inside. On a narrow card it
  // takes its own line under the name and drops its leading dot, so no line
  // starts or ends on a dangling separator. Its -mt-1 cancels the row gap
  // but no more, so the city link's target stays clear of the author link.
  const identityMeta = (Boolean(project.city) || showAge) && (
    <span className="flex min-w-0 max-w-full items-center gap-2 @max-xl:-mt-1 @max-xl:basis-full @max-xl:pl-10.5">
      <span
        aria-hidden="true"
        className="shrink-0 text-meta text-text-muted @max-xl:hidden"
      >
        ·
      </span>
      {project.city && (
        <CityPill
          variant="inline"
          city={project.city}
          // The city name alone ("HYDERABAD"); the full label is the title.
          label={
            showFullCity ? project.city : project.city.split(',')[0]?.trim()
          }
          cityId={project.cityId ?? null}
          citySlug={project.citySlug ?? null}
          truncate={!showFullCity}
          className={cn(aboveCover, 'min-w-0 max-w-full')}
        />
      )}
      {project.city && showAge && separator}
      {showAge && latestUpdate && (
        <span
          title={hasClock ? latestUpdate.label : undefined}
          className="min-h-lh shrink-0 text-eyebrow whitespace-nowrap text-text-muted"
        >
          <span className="sr-only">{latestUpdate.kind}</span>
          {hasClock && latestUpdate.age}
        </span>
      )}
    </span>
  )
  const identityRow = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      {authorIdentity}
      {collaborationStatus && <StatusPill status={collaborationStatus} />}
      {identityMeta}
    </div>
  )

  const commentActionClassName = cn(
    aboveCover,
    'inline-flex h-7 items-center justify-center gap-1.5 rounded-control px-2 font-mono text-label text-text-muted no-underline transition-colors hover:bg-state-hover hover:text-text pointer-coarse:min-h-11 pointer-coarse:min-w-11',
  )
  const commentAction = onComment ? (
    <button
      type="button"
      onClick={onComment}
      className={commentActionClassName}
    >
      <MessageSquare size={13} strokeWidth={1.5} aria-hidden="true" />
      {commentLabel}
    </button>
  ) : projectLink ? (
    <Link
      to="/project/$owner/$repo"
      params={{ owner: projectLink.owner, repo: projectLink.repo }}
      hash="comments"
      className={commentActionClassName}
    >
      <MessageSquare size={13} strokeWidth={1.5} aria-hidden="true" />
      {commentLabel}
    </Link>
  ) : project.commentsCount > 0 ? (
    <span className="inline-flex items-center gap-1.5 font-mono text-label text-text-muted">
      <MessageSquare size={13} strokeWidth={1.5} aria-hidden="true" />
      {commentLabel}
    </span>
  ) : null

  const title = (
    <>
      {project.owner}/{project.repo}
    </>
  )
  const topics = project.topics?.slice(0, 3) ?? []
  const hasMeta =
    Boolean(primaryLanguage) ||
    project.githubStars > 0 ||
    (project.forksCount ?? 0) > 0 ||
    topics.length > 0 ||
    (project.postsCount ?? 0) > 0

  return (
    <div
      onFocus={preloadProjectRoute}
      onPointerEnter={preloadProjectRoute}
      onTouchStart={preloadProjectRoute}
      className={cn(
        isRow
          ? 'bg-surface px-5 py-4'
          : cardVariants({ density: compact ? 'compact' : 'cozy' }),
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
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {showAuthorHeader && <div className="mb-1">{identityRow}</div>}
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
                'max-w-full text-left text-title text-text no-underline wrap-anywhere',
              )}
            >
              {title}
            </Link>
          ) : (
            <p className="m-0 max-w-full text-title text-text wrap-anywhere">
              {title}
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
              '-mt-1 -mr-2 flex size-7 shrink-0 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-state-hover hover:text-text pointer-coarse:size-11',
            )}
            type="button"
          >
            <X size={12} aria-hidden="true" />
          </button>
        )}
      </div>

      {((!showAuthorHeader && latestUpdate) || freshnessLabel) && (
        <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-meta text-text-muted">
          {!showAuthorHeader && latestUpdate && (
            <span className="min-h-lh">{hasClock && latestUpdate.label}</span>
          )}
          {freshnessLabel && (
            <span className="min-h-lh">{hasClock && freshnessLabel}</span>
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

      {hasMeta && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-label text-text-muted">
          {primaryLanguage && <LangDot lang={primaryLanguage} showLabel />}
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
          {topics.map((topic) => (
            <span key={topic} className="text-meta">
              #{topic}
            </span>
          ))}
          {project.postsCount !== undefined && project.postsCount > 0 && (
            <span>
              {project.postsCount.toLocaleString()}{' '}
              {project.postsCount === 1 ? 'post' : 'posts'}
            </span>
          )}
        </div>
      )}

      {(authorPlacement === 'footer' ||
        reactionSlot ||
        commentAction ||
        hasActions) && (
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-2',
            !isRow && ['border-t border-line', compact ? 'pt-2' : 'pt-3'],
          )}
        >
          {authorPlacement === 'footer' && (
            <div className="flex min-w-0 basis-full">{identityRow}</div>
          )}

          {/* Sized to its content, so on a narrow card the trailing actions
              drop to their own line (right-aligned) instead of squeezing the
              reactions and the comment link apart. */}
          <div className="flex min-w-0 flex-auto flex-wrap items-center gap-1.5">
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
              {actionSlot}
              {onFollow && (
                // Solid accent until followed, then a quiet "following".
                <Button
                  size="sm"
                  variant={project.followed ? 'ghost' : 'primary'}
                  className="pointer-coarse:min-h-11"
                  onClick={onFollow}
                  disabled={followPending}
                >
                  {project.followed ? 'following' : 'follow'}
                </Button>
              )}
              {onToggleSave && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="pointer-coarse:min-h-11"
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
            </div>
          )}
        </div>
      )}
    </div>
  )
}
