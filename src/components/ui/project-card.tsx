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
  lastCommitLabel?: string
  githubStars: number
  locaticLikes: number
  commentsCount: number
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
  likePending?: boolean
  followPending?: boolean
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
  likePending,
  followPending,
  className,
  showActions = true,
}: ProjectCardProps) {
  const compact = density === 'compact'
  const pad = compact ? '14px 16px' : '18px 20px'
  const gap = compact ? 10 : 14

  return (
    <div
      className={cn('lx-card lx-fade-up', className)}
      style={{
        background: 'var(--lx-surface)',
        border: '1px solid var(--lx-border)',
        borderRadius: 6,
        padding: pad,
        display: 'flex',
        flexDirection: 'column',
        gap,
        position: 'relative',
      }}
    >
      {/* Top row: repo name + dismiss */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 4,
            }}
          >
            {/* Repo name */}
            <button
              onClick={onCardClick}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: onCardClick ? 'pointer' : 'default',
                textAlign: 'left',
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 14.5,
                fontWeight: 600,
                color: 'var(--lx-text)',
                letterSpacing: '-0.01em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
              }}
            >
              <span style={{ color: 'var(--lx-text-3)', fontWeight: 400 }}>
                {project.owner}/
              </span>
              {project.repo}
            </button>

            {project.isRecommended && (
              <span
                style={{
                  fontFamily: 'var(--lx-font-mono)',
                  fontSize: 9.5,
                  padding: '2px 6px',
                  borderRadius: 2,
                  color: 'var(--lx-accent)',
                  background: 'var(--lx-accent-quiet)',
                  border: '1px solid oklch(72% 0.17 185 / 0.3)',
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {project.matchPct
                  ? `${project.matchPct}% match`
                  : 'recommended'}
              </span>
            )}
          </div>

          {project.description && (
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--lx-font-sans)',
                fontSize: 13.5,
                color: 'var(--lx-text-2)',
                lineHeight: 1.5,
                display: '-webkit-box',
                WebkitLineClamp: compact ? 1 : 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {project.description}
            </p>
          )}
        </div>

        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--lx-text-3)',
              cursor: 'pointer',
              padding: 4,
              marginRight: -4,
              marginTop: -2,
              borderRadius: 4,
              display: 'flex',
              flexShrink: 0,
            }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Meta row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: compact ? 12 : 14,
          fontFamily: 'var(--lx-font-mono)',
          fontSize: 11.5,
          color: 'var(--lx-text-3)',
          flexWrap: 'wrap',
        }}
      >
        {project.lang && (
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <LangDot lang={project.lang} />
            {project.lang}
          </span>
        )}
        {project.lastCommitLabel && <span>{project.lastCommitLabel}</span>}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Star size={11} strokeWidth={1.4} />
          {project.githubStars.toLocaleString()}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: project.liked ? 'var(--lx-accent)' : 'var(--lx-text-3)',
          }}
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
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: 'none',
            border: 'none',
            padding: 0,
            color: 'var(--lx-text-3)',
            cursor: onComment ? 'pointer' : 'default',
            fontFamily: 'inherit',
            fontSize: 'inherit',
          }}
        >
          <MessageSquare size={11} strokeWidth={1.4} />
          {project.commentsCount}
        </button>
        {project.forksCount !== undefined && (
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <GitFork size={11} strokeWidth={1.4} />
            {project.forksCount.toLocaleString()}
          </span>
        )}
      </div>

      {/* Author row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          paddingTop: compact ? 4 : 6,
          borderTop: '1px solid var(--lx-border)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            minWidth: 0,
            flex: 1,
          }}
        >
          <LxAvatar
            name={project.authorHandle}
            avatarUrl={project.authorAvatarUrl}
            size={22}
          />
          <span
            style={{
              fontFamily: 'var(--lx-font-sans)',
              fontSize: 12.5,
              color: 'var(--lx-text-2)',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {project.authorName || project.authorHandle}
          </span>
          {project.city && <CityPill city={project.city} />}
        </div>

        {showActions && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexShrink: 0,
            }}
          >
            {onFollow && (
              <Button
                size="sm"
                variant="outline"
                onClick={onFollow}
                disabled={followPending}
                style={{
                  fontFamily: 'var(--lx-font-mono)',
                  fontSize: 10.5,
                  padding: '4px 10px',
                  height: 'auto',
                  borderColor: project.followed
                    ? 'var(--lx-border-strong)'
                    : undefined,
                  color: project.followed ? 'var(--lx-text-2)' : undefined,
                }}
              >
                {project.followed ? 'following' : 'follow'}
              </Button>
            )}
            {onDM && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onDM}
                style={{
                  fontFamily: 'var(--lx-font-mono)',
                  fontSize: 10.5,
                  padding: '4px 8px',
                  height: 'auto',
                  color: 'var(--lx-text-3)',
                }}
              >
                dm
              </Button>
            )}
            <button
              onClick={onLike}
              disabled={likePending}
              aria-label={project.liked ? 'Unlike' : 'Like'}
              aria-pressed={project.liked}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: likePending ? 'default' : 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                color: project.liked ? 'var(--lx-accent)' : 'var(--lx-text-3)',
                opacity: likePending ? 0.6 : 1,
                transition: 'color 0.15s',
              }}
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
  const pad = compact ? '14px 16px' : '18px 20px'
  return (
    <div
      style={{
        background: 'var(--lx-surface)',
        border: '1px solid var(--lx-border)',
        borderRadius: 6,
        padding: pad,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div className="lx-skeleton" style={{ height: 14, width: '60%' }} />
      <div className="lx-skeleton" style={{ height: 12, width: '90%' }} />
      <div className="lx-skeleton" style={{ height: 12, width: '75%' }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <div className="lx-skeleton" style={{ height: 10, width: 40 }} />
        <div className="lx-skeleton" style={{ height: 10, width: 40 }} />
        <div className="lx-skeleton" style={{ height: 10, width: 40 }} />
      </div>
    </div>
  )
}
