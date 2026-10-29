import { Link } from '@tanstack/react-router'
import { useId, type ReactNode } from 'react'
import { PersonRow } from '@/components/ui/person-row'
import { isCollaborationStatus, StatusPill } from '@/components/ui/status-pill'
import { MessageSquare } from '@/lib/icons'
import { cn } from '@/lib/utils'
import type { BuilderPreview } from '@/features/explore/types'
import { SignInLink } from './sign-in-link'

const followButtonClass =
  'h-8 shrink-0 rounded-md border px-3 pointer-coarse:h-auto pointer-coarse:min-h-11 font-mono text-label transition-colors'
const messageIconButtonClass =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-line text-text-muted transition-colors hover:border-text-muted hover:text-text disabled:cursor-default disabled:opacity-60 pointer-coarse:size-11'

export function NearbyBuilderRow({
  builder,
  compact = false,
  onFollow,
  onMessage,
  followed,
  followPending,
  messagePending,
  isSelf,
  visitor,
}: {
  builder: BuilderPreview
  compact?: boolean
  onFollow: () => void
  onMessage?: () => void
  followed: boolean
  followPending: boolean
  messagePending?: boolean
  isSelf?: boolean
  /** Signed-out visitor: follow becomes a sign-in link, message is hidden. */
  visitor?: { signInRedirect: string | undefined }
}) {
  // A young account without public work reads as new, not inactive.
  const handle = (
    <>
      @{builder.githubUsername}
      {isSelf ? ' · you' : ''}
      {builder.isNewBuilder ? ' · new builder' : ''}
    </>
  )
  // Collaboration intent beside the handle. The identity link's
  // `aria-label` hides its content from assistive tech, so the pill is also
  // the link's description.
  const statusId = useId()
  const collaborationStatus = isCollaborationStatus(builder.buildStatus)
    ? builder.buildStatus
    : null
  const metadata = collaborationStatus ? (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="min-w-0 wrap-anywhere">{handle}</span>
      <span id={statusId} className="shrink-0">
        <StatusPill status={collaborationStatus} />
      </span>
    </span>
  ) : (
    handle
  )
  const renderIdentity = (content: ReactNode, className: string) => (
    // A real link, so the profile is reachable without JavaScript too.
    <Link
      to="/u/$username"
      params={{ username: builder.githubUsername }}
      search={{ tab: 'projects' }}
      aria-label={`Open ${builder.displayName}'s profile`}
      aria-describedby={collaborationStatus ? statusId : undefined}
      className={cn(className, 'no-underline')}
    >
      {content}
    </Link>
  )

  // Actions remain independent of the profile and location links as the row wraps.
  const action = visitor ? (
    <SignInLink
      label={`Sign in to follow ${builder.displayName}`}
      redirect={visitor.signInRedirect}
    >
      follow
    </SignInLink>
  ) : !isSelf || onMessage ? (
    <div className="flex items-center gap-1.5">
      {onMessage && (
        <button
          type="button"
          onClick={onMessage}
          disabled={messagePending}
          aria-label={`Message ${builder.displayName}`}
          className={messageIconButtonClass}
        >
          <MessageSquare size={15} strokeWidth={1.6} />
        </button>
      )}
      {!isSelf && (
        <button
          type="button"
          onClick={onFollow}
          disabled={followPending}
          className={`${followButtonClass} ${
            followed
              ? 'border-text-muted text-text'
              : 'border-brand/40 text-brand hover:border-brand hover:bg-selected'
          }`}
        >
          {followPending ? '…' : followed ? 'following' : 'follow'}
        </button>
      )}
    </div>
  ) : undefined

  if (compact) {
    return (
      <PersonRow
        avatarName={builder.displayName}
        avatarUrl={builder.avatarUrl}
        size={32}
        title={builder.displayName}
        meta={metadata}
        location={builder.location}
        renderIdentity={renderIdentity}
        action={action}
        className="border-b border-line py-3 last:border-b-0"
      />
    )
  }

  const stats = [
    `${builder.projectsCount.toLocaleString()} ${
      builder.projectsCount === 1 ? 'project' : 'projects'
    }`,
    `${builder.followersCount.toLocaleString()} ${
      builder.followersCount === 1 ? 'follower' : 'followers'
    }`,
  ].join(' · ')

  // Frameless cozy row — the enclosing CardSheet owns the border + divider.
  return (
    <div className="bg-surface px-5 py-4">
      <PersonRow
        avatarName={builder.displayName}
        avatarUrl={builder.avatarUrl}
        size={40}
        title={builder.displayName}
        meta={metadata}
        subtitle={stats}
        location={builder.location}
        renderIdentity={renderIdentity}
        action={action}
      />
    </div>
  )
}
