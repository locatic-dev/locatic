import { useState } from 'react'

import { PersonRow } from '@/components/ui/person-row'
import { useFollowUser, useUnfollowUser } from '@/features/follows/mutations'
import { reportActionError } from '@/lib/action-error'
import type { OnboardingBuilderSuggestion } from '@/features/onboarding/queries'

const followButtonClass =
  'min-h-11 shrink-0 rounded-md border px-3 font-mono text-[11.5px] transition-colors'

/**
 * The optional follow list (plan D7): one follow toggle per builder, nothing
 * followed without a click. The button stays enabled while a request runs so
 * keyboard focus is never dropped; repeat presses are ignored instead.
 */
export function FollowStepFields({
  builders,
}: {
  builders: ReadonlyArray<OnboardingBuilderSuggestion>
}) {
  const followUser = useFollowUser()
  const unfollowUser = useUnfollowUser()
  // Local result of this step's clicks; the live query catches up on its own.
  const [followingById, setFollowingById] = useState<Record<string, boolean>>(
    {},
  )
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())

  const setPending = (userId: string, pending: boolean) =>
    setPendingIds((current) => {
      const next = new Set(current)
      if (pending) {
        next.add(userId)
      } else {
        next.delete(userId)
      }
      return next
    })

  const toggleFollow = async (builder: OnboardingBuilderSuggestion) => {
    const userId = String(builder.userId)
    if (pendingIds.has(userId)) {
      return
    }

    const isFollowing = followingById[userId] ?? builder.viewerIsFollowing
    setPending(userId, true)

    try {
      if (isFollowing) {
        await unfollowUser({ targetUserId: builder.userId })
      } else {
        await followUser({ targetUserId: builder.userId })
      }
      setFollowingById((current) => ({ ...current, [userId]: !isFollowing }))
    } catch (error) {
      reportActionError(error, {
        title: isFollowing ? "couldn't unfollow" : "couldn't follow",
      })
    } finally {
      setPending(userId, false)
    }
  }

  return (
    <>
      <p className="m-0 mb-2 font-mono text-meta text-text-muted">
        most recent public work first
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {builders.map((builder) => {
          const userId = String(builder.userId)
          const isFollowing = followingById[userId] ?? builder.viewerIsFollowing
          const pending = pendingIds.has(userId)

          return (
            <li key={userId}>
              <PersonRow
                avatarName={builder.displayName}
                avatarUrl={builder.avatarUrl}
                title={builder.displayName}
                meta={`@${builder.githubUsername}`}
                subtitle={`${builder.projectsCount} ${
                  builder.projectsCount === 1 ? 'project' : 'projects'
                }${builder.isNewBuilder ? ' · new builder' : ''}`}
                action={
                  <button
                    type="button"
                    aria-pressed={isFollowing}
                    aria-busy={pending || undefined}
                    aria-label={`follow ${builder.displayName}`}
                    onClick={() => void toggleFollow(builder)}
                    className={`${followButtonClass} ${
                      isFollowing
                        ? 'border-text-muted text-text'
                        : 'border-brand/40 text-brand hover:border-brand hover:bg-selected'
                    }`}
                  >
                    {pending ? '…' : isFollowing ? 'following' : 'follow'}
                  </button>
                }
              />
            </li>
          )
        })}
      </ul>
    </>
  )
}
