import { Star, Heart, MessageSquare, X, GitFork } from '@/lib/icons'
import { LxAvatar } from './lx-avatar'
import { LangDot } from './lang-dot'
import { CityPill } from './city-pill'
import { Button } from './button'
import { cn } from '@/lib/utils'

export interface ProjectCardData {
  id?: string
  owner: string
  repo: string
  fullName?: string
  description?: string | null
  lang?: string | null
  languages?: Array<{ name: string; bytes: number }>
  lastCommitLabel?: string
  githubStars: number
  locaticLikes: number
  commentsCount: number
  postsCount?: number
  topics?: string[]
  forksCount?: number
  authorName: string
  authorHandle: string
  authorAvatarUrl?: string | null
  city?: string | null
  buildStatus?: string | null
  liked?: boolean
  followed?: boolean
  isPinned?: boolean
  isRecommended?: boolean
  matchPct?: number
}

interface ProjectCardProps {
  project: ProjectCardData
  density?: 'cozy' | 'compact'
  onLike?: () => void
  onComment?: () => void
  onDM?: () => void
  onFollow?: () => void
  onDismiss?: () => void
  onCardClick?: () => void
  onAuthorClick?: () => void
  likePending?: boolean
  followPending?: boolean
  dmPending?: boolean
  className?: string
  showActions?: boolean
}

export function ProjectCard({
  project,
  density = 'cozy',
  onLike,
  onComment,
  onDM,
  onFollow,
  onDismiss,
  onCardClick,
  onAuthorClick,
  likePending,
  followPending,
  dmPending,
  className,
  showActions = true,
}: ProjectCardProps) {
  const compact = density === 'compact'
  const authorLabel = project.authorName || project.authorHandle
  const languages =
    project.languages && project.languages.length > 0
      ? project.languages
      : project.lang
        ? [{ name: project.lang, bytes: 0 }]
        : []

  return (
    <div
      className={cn(
        'lx-card lx-fade-up @container relative flex flex-col rounded-card border border-line bg-surface',
        compact ? 'gap-2.5 px-4 py-3.5' : 'gap-3.5 px-5 py-4.5',
        className,
      )}
    >
      {/* Top row: repo name + dismiss */}
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            {/* Repo name */}
            <button
              onClick={onCardClick}
              aria-label={
                onCardClick
                  ? `Open ${project.fullName ?? `${project.owner}/${project.repo}`}`
                  : undefined
              }
              className="max-w-full whitespace-normal border-none bg-transparent p-0 text-left font-mono text-[14.5px] font-semibold tracking-[-0.01em] text-text transition-colors wrap-anywhere leading-[1.35] disabled:cursor-default"
              disabled={!onCardClick}
              type="button"
            >
              <span className="font-normal text-text-faint">
                {project.owner}/
              </span>
              {project.repo}
            </button>

            {project.isRecommended && (
              <span className="rounded-[2px] border border-[oklch(72%_0.17_185/0.3)] bg-brand-quiet px-1.5 py-0.5 font-mono text-[9.5px] leading-none whitespace-nowrap text-brand">
                {project.matchPct
                  ? `${project.matchPct}% match`
                  : 'recommended'}
              </span>
            )}
          </div>

          {project.description && (
            <p
              className={cn(
                'm-0 overflow-hidden font-sans text-[13.5px] leading-6 text-text-muted',
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
            aria-label="Dismiss"
            className="-mr-1 -mt-0.5 flex shrink-0 rounded-sm border-none bg-transparent p-1 text-text-faint transition-colors hover:text-text"
            type="button"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Meta row */}
      <div
        className={cn(
          'flex flex-wrap items-center font-mono text-[11.5px] text-text-faint',
          compact ? 'gap-3' : 'gap-3.5',
        )}
      >
        {languages.slice(0, 3).map((language) => (
          <span
            key={language.name}
            className="inline-flex items-center gap-1.5"
          >
            <LangDot lang={language.name} />
            {language.name}
          </span>
        ))}
        {project.lastCommitLabel && <span>{project.lastCommitLabel}</span>}
        {project.topics?.slice(0, 4).map((topic) => (
          <span
            key={topic}
            className="rounded-[2px] border border-line bg-canvas px-1.5 py-0.5 text-[10.5px] text-text-muted"
          >
            #{topic}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <Star size={11} strokeWidth={1.4} />
          {project.githubStars.toLocaleString()}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1',
            project.liked ? 'text-brand' : 'text-text-faint',
          )}
        >
          <Heart
            size={11}
            strokeWidth={1.4}
            fill={project.liked ? 'currentColor' : 'none'}
          />
          {project.locaticLikes.toLocaleString()}
        </span>
        <button
          onClick={onComment}
          aria-label="Comments"
          className="inline-flex items-center gap-1 border-none bg-transparent p-0 text-inherit"
          disabled={!onComment}
          type="button"
        >
          <MessageSquare size={11} strokeWidth={1.4} />
          {project.commentsCount}
        </button>
        {project.postsCount !== undefined && project.postsCount > 0 && (
          <span className="inline-flex items-center gap-1">
            {project.postsCount} posts
          </span>
        )}
        {project.forksCount !== undefined && (
          <span className="inline-flex items-center gap-1">
            <GitFork size={11} strokeWidth={1.4} />
            {project.forksCount.toLocaleString()}
          </span>
        )}
      </div>

      {/* Author row */}
      <div
        className={cn(
          'flex flex-wrap items-start justify-between gap-2.5 border-t border-line',
          compact ? 'pt-1' : 'pt-1.5',
        )}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {onAuthorClick ? (
            <button
              type="button"
              onClick={onAuthorClick}
              aria-label={`Open ${authorLabel}'s profile`}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md bg-transparent px-0 py-2 text-left transition-colors hover:text-text"
            >
              <LxAvatar
                name={project.authorHandle}
                avatarUrl={project.authorAvatarUrl}
                size={22}
              />
              <span className="truncate font-sans text-[12.5px] font-medium text-text-muted">
                {authorLabel}
              </span>
            </button>
          ) : (
            <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 py-2">
              <LxAvatar
                name={project.authorHandle}
                avatarUrl={project.authorAvatarUrl}
                size={22}
              />
              <span className="truncate font-sans text-[12.5px] font-medium text-text-muted">
                {authorLabel}
              </span>
            </div>
          )}
          {project.city && (
            <CityPill
              city={project.city}
              className="basis-full sm:basis-auto"
            />
          )}
        </div>

        {showActions && (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {onFollow && (
              <Button
                size="sm"
                variant="outline"
                onClick={onFollow}
                disabled={followPending}
                className={cn(
                  'min-h-11 font-mono text-[10.5px]',
                  project.followed && 'border-line-strong text-text-muted',
                )}
              >
                {project.followed ? 'following' : 'follow'}
              </Button>
            )}
            {onDM && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onDM}
                disabled={dmPending}
                className="min-h-11 font-mono text-[10.5px] text-text-faint"
              >
                {dmPending ? 'opening…' : 'message'}
              </Button>
            )}
            <button
              onClick={onLike}
              disabled={likePending}
              aria-label={project.liked ? 'Unlike' : 'Like'}
              aria-pressed={project.liked}
              className={cn(
                'flex min-h-11 min-w-11 items-center justify-center border-none bg-transparent p-3 transition-colors',
                project.liked ? 'text-brand' : 'text-text-faint',
                likePending
                  ? 'cursor-default opacity-60'
                  : 'cursor-pointer hover:text-brand',
              )}
              type="button"
            >
              <Heart
                size={16}
                strokeWidth={1.6}
                fill={project.liked ? 'currentColor' : 'none'}
              />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Skeleton variant ─────────────────────────────────────────────── */
export function ProjectCardSkeleton({
  compact = false,
}: {
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-card border border-line bg-surface',
        compact ? 'px-4 py-3.5' : 'px-5 py-4.5',
      )}
    >
      <div className="lx-skeleton h-3.5 w-3/5" />
      <div className="lx-skeleton h-3 w-[90%]" />
      <div className="lx-skeleton h-3 w-3/4" />
      <div className="mt-1 flex gap-2">
        <div className="lx-skeleton h-2.5 w-10" />
        <div className="lx-skeleton h-2.5 w-10" />
        <div className="lx-skeleton h-2.5 w-10" />
      </div>
    </div>
  )
}
