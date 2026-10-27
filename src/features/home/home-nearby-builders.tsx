import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { CardSheet } from '@/components/ui/card-sheet'
import { PersonRow } from '@/components/ui/person-row'
import { useFollowUser, useUnfollowUser } from '@/features/follows/mutations'
import { reportActionError } from '@/lib/action-error'
import { showUndoToast } from '@/lib/undo-toast'
import type { HomeNearbyBuilder } from './queries'

/**
 * Suggestions shown beside an empty Home with no follows:
 * each builder links to their profile, shows their city pill and has one
 * follow toggle. Following or unfollowing confirms with an undo toast.
 * Ordered most recent public work first.
 */
export function HomeNearbyBuilders({
  builders,
}: {
  builders: ReadonlyArray<HomeNearbyBuilder>
}) {
  const followUser = useFollowUser()
  const unfollowUser = useUnfollowUser()
  // Local result of clicks here; the live query catches up on its own.
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

  // Shared by the toggle and its undo; rejects so each caller reports.
  const setFollowing = async (
    builder: HomeNearbyBuilder,
    nextFollowing: boolean,
  ) => {
    const userId = String(builder.userId)
    setPending(userId, true)
    try {
      if (nextFollowing) {
        await followUser({ targetUserId: builder.userId })
      } else {
        await unfollowUser({ targetUserId: builder.userId })
      }
      setFollowingById((current) => ({ ...current, [userId]: nextFollowing }))
    } finally {
      setPending(userId, false)
    }
  }

  const toggleFollow = async (builder: HomeNearbyBuilder) => {
    const userId = String(builder.userId)
    if (pendingIds.has(userId)) return
    const isFollowing = followingById[userId] ?? builder.viewerIsFollowing

    try {
      await setFollowing(builder, !isFollowing)
    } catch (error) {
      reportActionError(error, {
        title: isFollowing ? "couldn't unfollow" : "couldn't follow",
        retry: () => toggleFollow(builder),
      })
      return
    }

    showUndoToast({
      message: `${isFollowing ? 'unfollowed' : 'following'} @${builder.githubUsername}`,
      undo: () => setFollowing(builder, isFollowing),
    })
  }

  return (
    <>
      <p className="m-0 mb-2 font-mono text-meta text-text-muted">
        most recent public work first
      </p>
      <CardSheet>
        {builders.map((builder) => {
          const userId = String(builder.userId)
          const isFollowing = followingById[userId] ?? builder.viewerIsFollowing

          return (
            <div key={userId} className="bg-surface px-4 py-3 sm:px-5">
              <PersonRow
                avatarName={builder.displayName}
                avatarUrl={builder.avatarUrl}
                title={builder.displayName}
                meta={`@${builder.githubUsername}`}
                subtitle={`${builder.projectsCount} ${
                  builder.projectsCount === 1 ? 'project' : 'projects'
                }${builder.isNewBuilder ? ' · new builder' : ''}`}
                location={builder.location}
                renderIdentity={(content, className) => (
                  <Link
                    to="/u/$username"
                    params={{ username: builder.githubUsername }}
                    search={{ tab: 'projects' }}
                    preload="intent"
                    aria-label={`Open ${builder.displayName}'s profile`}
                    className={className}
                  >
                    {content}
                  </Link>
                )}
                action={
                  <Button
                    type="button"
                    size="touch"
                    aria-pressed={isFollowing}
                    // The name starts with the visible label (WCAG 2.5.3).
                    aria-label={`${isFollowing ? 'following' : 'follow'} ${builder.displayName}`}
                    onClick={() => void toggleFollow(builder)}
                  >
                    {isFollowing ? 'following' : 'follow'}
                  </Button>
                }
              />
            </div>
          )
        })}
      </CardSheet>
    </>
  )
}
