import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import {
  ArrowRight,
  Code2,
  FileText,
  GitFork,
  Heart,
  MessageSquare,
  UserPlus,
} from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { langColor } from '@/components/ui/lang-dot'
import { cn } from '@/lib/utils'
import {
  type HomeFeedCommentTarget,
  type HomeFeedItem,
  type HomeFeedPostTarget,
  type HomeFeedProjectTarget,
  type HomeFeedPullRequestTarget,
  type HomeFeedTarget,
} from './cache'
import { getHomeFeedSummary, getHomeFeedTimeCopy } from './feed-copy'

const COLLAPSED_PREVIEW_LIMIT = 3
const EXPANDED_PREVIEW_LIMIT = 10

type HomeFeedCardProps = {
  item: HomeFeedItem
  likedProjectIds: Set<string>
  pendingLikes: Set<string>
  onLikeProject: (projectId: Id<'projects'>, projectKey: string) => void
}

function isCommentGroup(item: HomeFeedItem) {
  const groupKind = item.groupKind ?? item.eventType
  return groupKind === 'project_commented' || groupKind === 'post_commented'
}

export function getHomeFeedPreviewState(item: HomeFeedItem, expanded: boolean) {
  const targets = item.previewTargets?.length
    ? item.previewTargets
    : item.target
      ? [item.target]
      : []
  const previewLimit = expanded
    ? EXPANDED_PREVIEW_LIMIT
    : COLLAPSED_PREVIEW_LIMIT
  const visibleTargets = targets.slice(0, previewLimit)
  const totalCount = item.eventCount ?? targets.length
  const remainingCount = Math.max(0, totalCount - visibleTargets.length)
  const hasStoredTargetsToExpand =
    !expanded && targets.length > visibleTargets.length

  return {
    hasStoredTargetsToExpand,
    remainingCount,
    targets,
    totalCount,
    visibleTargets,
  }
}

function projectDisplay(
  target:
    | HomeFeedProjectTarget
    | HomeFeedPostTarget
    | HomeFeedCommentTarget
    | HomeFeedPullRequestTarget,
) {
  const preview = target.projectPreview
  const snapshot = target.projectSnapshot

  return {
    owner: preview?.owner ?? snapshot.ownerLogin,
    repo: preview?.repo ?? snapshot.name,
    fullName: preview?.fullName ?? snapshot.fullName,
    description: preview?.description ?? snapshot.description,
    languages:
      preview?.languages && preview.languages.length > 0
        ? preview.languages
        : snapshot.languages,
    primaryLanguage: preview?.primaryLanguage ?? snapshot.primaryLanguage,
    likesCount: preview?.locaticLikes ?? snapshot.likesCount,
    commentsCount: preview?.commentsCount ?? snapshot.commentsCount,
    starsCount: preview?.githubStars ?? snapshot.stargazersCount,
  }
}

export function getHomeFeedTargetRoute(
  target:
    | HomeFeedProjectTarget
    | HomeFeedPostTarget
    | HomeFeedCommentTarget
    | HomeFeedPullRequestTarget,
) {
  const project = projectDisplay(target)
  if (!project.owner || !project.repo || target.isOpenable === false) {
    return null
  }

  if (target.kind === 'comment') {
    const ancestorCommentIds = target.ancestorCommentIds ?? []
    const commentPath =
      ancestorCommentIds.length > 0
        ? ancestorCommentIds.map((commentId) => String(commentId)).join(',')
        : undefined

    return {
      hash: `comment-${String(target.commentId)}`,
      params: { owner: project.owner, repo: project.repo },
      search: {
        comment: String(target.commentId),
        ...(commentPath ? { commentPath } : {}),
        ...(target.postId ? { post: String(target.postId) } : {}),
        thread: String(target.rootCommentId ?? target.commentId),
      },
      to: '/project/$owner/$repo' as const,
    }
  }

  if (target.kind === 'post') {
    return {
      params: { owner: project.owner, repo: project.repo },
      search: { post: String(target.postId) },
      to: '/project/$owner/$repo' as const,
    }
  }

  return {
    params: { owner: project.owner, repo: project.repo },
    to: '/project/$owner/$repo' as const,
  }
}

function iconForTarget(target: HomeFeedTarget) {
  switch (target.kind) {
    case 'profile':
      return UserPlus
    case 'comment':
      return MessageSquare
    case 'post':
      return FileText
    case 'pull_request':
      return GitFork
    case 'project':
      return Code2
  }
}

/** Restrained per-kind tint for the grouped-row icon tile (content signal). */
function targetKindAccent(kind: HomeFeedTarget['kind']): string {
  switch (kind) {
    case 'project':
      return 'var(--lx-accent)'
    case 'post':
      return '#60a5fa'
    case 'comment':
      return '#a78bfa'
    case 'profile':
      return '#34d399'
    case 'pull_request':
      return '#fbbf24'
  }
}

function ProjectMeta({
  target,
}: {
  target: HomeFeedProjectTarget | HomeFeedPostTarget | HomeFeedCommentTarget
}) {
  const project = projectDisplay(target)
  const languages =
    project.languages.length > 0
      ? project.languages
      : project.primaryLanguage
        ? [{ name: project.primaryLanguage, bytes: 0 }]
        : []
  const primaryLanguage = languages[0]?.name

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-text-muted">
      {primaryLanguage && (
        <span
          className="inline-flex items-center gap-1.5 rounded-control border px-1.5 py-0.5 text-text"
          style={{
            background: `${langColor(primaryLanguage)}1f`,
            borderColor: `${langColor(primaryLanguage)}80`,
          }}
        >
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: langColor(primaryLanguage) }}
            aria-hidden
          />
          {primaryLanguage}
        </span>
      )}
      <span className="inline-flex items-center gap-1">
        <Heart size={11} strokeWidth={1.4} />
        {project.likesCount.toLocaleString()}
      </span>
      <span className="inline-flex items-center gap-1">
        <MessageSquare size={11} strokeWidth={1.4} />
        {project.commentsCount.toLocaleString()}
      </span>
    </div>
  )
}

function ProjectTargetRow({
  target,
  lean,
  likedProjectIds,
  pendingLikes,
  onLikeProject,
}: {
  target: HomeFeedProjectTarget
  lean?: boolean
  likedProjectIds: Set<string>
  pendingLikes: Set<string>
  onLikeProject: HomeFeedCardProps['onLikeProject']
}) {
  const project = projectDisplay(target)
  const routeTarget = getHomeFeedTargetRoute(target)
  const projectKey = String(target.projectId)
  const liked = likedProjectIds.has(projectKey)
  const content = (
    <div className="min-w-0 flex-1">
      <p className="font-mono text-[13px] leading-5 text-text wrap-anywhere">
        <span className="text-text-faint">{project.owner}/</span>
        {project.repo}
      </p>
      {project.description && (
        <p className="mt-1 line-clamp-2 font-sans text-[13px] leading-5 text-text-muted">
          {project.description}
        </p>
      )}
      <ProjectMeta target={target} />
    </div>
  )

  return (
    <TargetRow target={target} lean={lean}>
      {routeTarget ? (
        <Link
          {...routeTarget}
          preload="intent"
          className="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {content}
        </Link>
      ) : (
        content
      )}
      {target.isOpenable !== false && (
        <Button
          type="button"
          variant="monoGhost"
          size="icon"
          aria-label={
            liked ? `Unlike ${project.fullName}` : `Like ${project.fullName}`
          }
          onClick={() => onLikeProject(target.projectId, projectKey)}
          className={cn(
            'min-h-11 min-w-11 shrink-0',
            liked && 'text-liked hover:text-liked',
          )}
          disabled={pendingLikes.has(projectKey)}
        >
          <Heart
            size={15}
            strokeWidth={1.7}
            className={liked ? 'fill-current' : undefined}
          />
        </Button>
      )}
    </TargetRow>
  )
}

function PostTargetRow({
  target,
  lean,
}: {
  target: HomeFeedPostTarget
  lean?: boolean
}) {
  const project = projectDisplay(target)
  const routeTarget = getHomeFeedTargetRoute(target)

  return (
    <TargetRow target={target} lean={lean}>
      {routeTarget ? (
        <Link
          {...routeTarget}
          preload="intent"
          className="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <p className="font-mono text-[12.5px] text-text-faint">
            {project.fullName}
          </p>
          <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-text">
            {target.postSnapshot?.body || 'Project update'}
          </p>
        </Link>
      ) : (
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[12.5px] text-text-faint">
            {project.fullName}
          </p>
          <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-text">
            {target.postSnapshot?.body || 'Project update'}
          </p>
        </div>
      )}
    </TargetRow>
  )
}

function CommentTargetRow({
  target,
  lean,
}: {
  target: HomeFeedCommentTarget
  lean?: boolean
}) {
  const project = projectDisplay(target)
  const routeTarget = getHomeFeedTargetRoute(target)

  return (
    <TargetRow target={target} lean={lean}>
      {routeTarget ? (
        <Link
          {...routeTarget}
          preload="intent"
          className="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <p className="font-mono text-[12.5px] text-text-faint">
            {target.targetType === 'post' ? 'update on ' : ''}
            {project.fullName}
          </p>
          <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-text">
            {target.content || 'Open comment thread'}
          </p>
        </Link>
      ) : (
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[12.5px] text-text-faint">
            {project.fullName}
          </p>
          <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-text">
            {target.content || 'Comment unavailable'}
          </p>
        </div>
      )}
    </TargetRow>
  )
}

function ProfileTargetRow({
  target,
  lean,
}: {
  target: Extract<HomeFeedTarget, { kind: 'profile' }>
  lean?: boolean
}) {
  const profile = target.profile
  const content = (
    <>
      <LxAvatar
        name={profile.displayName}
        avatarUrl={profile.avatarUrl}
        size={34}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-text">
          {profile.displayName}
        </p>
        <p className="truncate font-mono text-[11.5px] text-text-faint">
          @{profile.githubUsername}
          {profile.cityName ? ` · ${profile.cityName}` : ''}
        </p>
      </div>
    </>
  )

  return (
    <TargetRow target={target} lean={lean}>
      {target.isOpenable === false ? (
        <div className="flex min-w-0 flex-1 items-center gap-3">{content}</div>
      ) : (
        <Link
          to="/u/$username"
          params={{ username: profile.githubUsername }}
          search={{ tab: 'projects' }}
          preload="intent"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {content}
        </Link>
      )}
    </TargetRow>
  )
}

function PullRequestTargetRow({
  target,
  lean,
}: {
  target: HomeFeedPullRequestTarget
  lean?: boolean
}) {
  const project = projectDisplay(target)

  return (
    <TargetRow target={target} lean={lean}>
      {target.url ? (
        <a
          href={target.url}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <p className="font-mono text-[12.5px] text-text-faint">
            {project.fullName} #{target.number}
          </p>
          <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-text">
            {target.title}
          </p>
        </a>
      ) : (
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[12.5px] text-text-faint">
            {project.fullName} #{target.number}
          </p>
          <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-text">
            {target.title}
          </p>
        </div>
      )}
    </TargetRow>
  )
}

function TargetRow({
  children,
  target,
  lean = false,
}: {
  children: ReactNode
  target: HomeFeedTarget
  lean?: boolean
}) {
  const Icon = iconForTarget(target)

  return (
    <div
      className={cn(
        'flex min-h-14 min-w-0 items-center gap-3 px-4 py-3 sm:px-5',
        lean ? 'pt-0' : 'border-t border-line first:border-t-0',
        target.isOpenable === false && 'opacity-70',
      )}
    >
      {!lean && (
        <span
          style={
            target.isOpenable === false
              ? undefined
              : { color: targetKindAccent(target.kind) }
          }
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-canvas',
            target.isOpenable === false && 'border-dashed text-text-faint',
          )}
        >
          <Icon size={15} strokeWidth={1.6} />
        </span>
      )}
      {children}
    </div>
  )
}

function targetRowKey(target: HomeFeedTarget) {
  switch (target.kind) {
    case 'project':
      return `project:${target.projectId}`
    case 'post':
      return `post:${target.postId}`
    case 'comment':
      return `comment:${target.commentId}`
    case 'profile':
      return `profile:${target.profile.userId}`
    case 'pull_request':
      return `pull_request:${target.projectId}:${target.number}`
  }
}

function TargetPreviewRow({
  target,
  lean,
  likedProjectIds,
  pendingLikes,
  onLikeProject,
}: {
  target: HomeFeedTarget
  lean?: boolean
  likedProjectIds: Set<string>
  pendingLikes: Set<string>
  onLikeProject: HomeFeedCardProps['onLikeProject']
}) {
  switch (target.kind) {
    case 'project':
      return (
        <ProjectTargetRow
          target={target}
          lean={lean}
          likedProjectIds={likedProjectIds}
          pendingLikes={pendingLikes}
          onLikeProject={onLikeProject}
        />
      )
    case 'post':
      return <PostTargetRow target={target} lean={lean} />
    case 'comment':
      return <CommentTargetRow target={target} lean={lean} />
    case 'profile':
      return <ProfileTargetRow target={target} lean={lean} />
    case 'pull_request':
      return <PullRequestTargetRow target={target} lean={lean} />
  }
}

export function HomeFeedCard({
  item,
  likedProjectIds,
  pendingLikes,
  onLikeProject,
}: HomeFeedCardProps) {
  const [expanded, setExpanded] = useState(false)
  const {
    hasStoredTargetsToExpand,
    remainingCount,
    targets,
    totalCount,
    visibleTargets,
  } = getHomeFeedPreviewState(item, expanded)
  const firstCommentTarget = targets.find(
    (target): target is HomeFeedCommentTarget => target.kind === 'comment',
  )
  const commentMoreRoute = firstCommentTarget
    ? getHomeFeedTargetRoute(firstCommentTarget)
    : null
  // Single-event cards render leaner than grouped cards: no icon-tile column,
  // no header/body divider — just the actor summary and the one target.
  const lean = totalCount <= 1
  // Only show the footer when it offers a real action. The old non-interactive
  // "Showing X of Y" dead-end is gone — the summary already conveys the count.
  const showCommentMore =
    remainingCount > 0 && isCommentGroup(item) && Boolean(commentMoreRoute)
  const showExpand = remainingCount > 0 && hasStoredTargetsToExpand
  return (
    <article className="lx-card @container overflow-hidden rounded-card border border-line bg-surface">
      <header className="flex min-w-0 items-start gap-3 px-4 py-4 sm:px-5">
        <LxAvatar
          name={item.actorSnapshot.displayName}
          avatarUrl={item.actorSnapshot.avatarUrl}
          size={40}
        />
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[14.5px] font-semibold leading-5 text-text wrap-anywhere">
            {getHomeFeedSummary(item)}
          </p>
          <p className="mt-1 font-mono text-[11px] text-text-faint">
            {getHomeFeedTimeCopy(item)}
          </p>
        </div>
      </header>

      <div className={lean ? undefined : 'border-t border-line'}>
        {visibleTargets.map((target) => (
          <TargetPreviewRow
            key={targetRowKey(target)}
            target={target}
            lean={lean}
            likedProjectIds={likedProjectIds}
            pendingLikes={pendingLikes}
            onLikeProject={onLikeProject}
          />
        ))}
      </div>

      {(showCommentMore || showExpand) && (
        <footer className="border-t border-line px-3 py-2 sm:px-4">
          {showCommentMore && commentMoreRoute ? (
            <Link
              {...commentMoreRoute}
              preload="intent"
              className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 font-mono text-[11.5px] text-text-muted transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              +{remainingCount} more
              <ArrowRight size={13} />
            </Link>
          ) : (
            <Button
              type="button"
              variant="monoGhost"
              size="meta"
              className="min-h-11"
              onClick={() => setExpanded(true)}
              disabled={expanded}
            >
              +{remainingCount} more
            </Button>
          )}
        </footer>
      )}
    </article>
  )
}
