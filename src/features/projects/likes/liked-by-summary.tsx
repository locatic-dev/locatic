import { useState } from 'react'
import { usePaginatedQuery } from 'convex/react'

import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { compactNumber } from '@/lib/format'

export type LikedByUser = {
  userId: Id<'users'>
  githubUsername: string
  displayName: string
  avatarUrl: string | null
}

const STACK_LIMIT = 5
const NAMED_LIMIT = 2

function buildSummary(names: string[], othersCount: number) {
  if (names.length === 0) {
    return `${compactNumber(othersCount)} ${othersCount === 1 ? 'like' : 'likes'}`
  }

  const joined =
    names.length === 1 ? names[0] : `${names[0]}, ${names.slice(1).join(', ')}`

  if (othersCount <= 0) {
    return joined
  }

  return `${joined} and ${compactNumber(othersCount)} ${
    othersCount === 1 ? 'other' : 'others'
  }`
}

export function LikedBySummary({
  projectId,
  likedByPreview,
  likesCount,
  onOpenProfile,
}: {
  projectId: Id<'projects'>
  likedByPreview: LikedByUser[]
  likesCount: number
  onOpenProfile: (githubUsername: string) => void
}) {
  const [open, setOpen] = useState(false)
  const likers = usePaginatedQuery(
    api.projects.listLikers,
    open ? { projectId } : 'skip',
    { initialNumItems: 20 },
  )

  if (likesCount <= 0 || likedByPreview.length === 0) {
    return null
  }

  const stack = likedByPreview.slice(0, STACK_LIMIT)
  const namedUsers = likedByPreview.slice(0, NAMED_LIMIT)
  const othersCount = Math.max(0, likesCount - namedUsers.length)
  const summary = buildSummary(
    namedUsers.map((user) => user.displayName),
    othersCount,
  )
  const canExpand = likesCount > namedUsers.length

  const content = (
    <>
      <span className="flex items-center">
        {stack.map((user, index) => (
          <LxAvatar
            key={String(user.userId)}
            name={user.displayName}
            avatarUrl={user.avatarUrl}
            size={20}
            className={index > 0 ? '-ml-2 ring-2 ring-canvas' : ''}
          />
        ))}
      </span>
      <span className="text-text-muted">
        <span className="text-text-faint">liked by</span> {summary}
      </span>
    </>
  )

  if (!canExpand) {
    return (
      <div className="mb-5 flex flex-wrap items-center gap-2.5 font-mono text-[11.5px]">
        <span className="flex items-center">
          {stack.map((user, index) => (
            <LxAvatar
              key={String(user.userId)}
              name={user.displayName}
              avatarUrl={user.avatarUrl}
              size={20}
              className={index > 0 ? '-ml-2 ring-2 ring-canvas' : ''}
            />
          ))}
        </span>
        <span className="text-text-faint">liked by</span>
        <span className="flex flex-wrap items-center gap-x-1 text-text-muted">
          {namedUsers.map((user, index) => (
            <span
              key={String(user.userId)}
              className="inline-flex items-center"
            >
              {index > 0 && (
                <span aria-hidden="true" className="text-text-faint">
                  ,
                </span>
              )}
              <button
                type="button"
                onClick={() => onOpenProfile(user.githubUsername)}
                className="-my-2 inline-flex min-h-11 items-center rounded-md bg-transparent px-1.5 text-left text-text-muted transition-colors hover:text-text"
                aria-label={`Open ${user.displayName}'s profile`}
              >
                {user.displayName}
              </button>
            </span>
          ))}
        </span>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-5 flex min-h-11 flex-wrap items-center gap-2.5 rounded-md bg-transparent font-mono text-[11.5px] transition-colors hover:[&_span]:text-text"
        aria-label={`View all ${compactNumber(likesCount)} people who liked this project`}
      >
        {content}
      </button>

      <DialogContent
        aria-describedby={undefined}
        className="max-h-[80vh] gap-0 overflow-hidden border-line bg-surface p-0"
      >
        <DialogHeader className="border-b border-line px-4 py-3 text-left">
          <DialogTitle className="font-mono text-[13px] font-semibold text-text">
            liked by {compactNumber(likesCount)}{' '}
            {likesCount === 1 ? 'person' : 'people'}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {likers.status === 'LoadingFirstPage' ? (
            <div className="px-2 py-4 font-mono text-[12px] text-text-faint">
              loading likes…
            </div>
          ) : likers.results.length === 0 ? (
            <div className="px-2 py-4 font-mono text-[12px] text-text-faint">
              no likes yet.
            </div>
          ) : (
            <ul className="flex flex-col">
              {likers.results.map((user) => (
                <li key={String(user.userId)}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      onOpenProfile(user.githubUsername)
                    }}
                    className="flex min-h-11 w-full items-center gap-2.5 rounded-md bg-transparent px-2 py-1.5 text-left transition-colors hover:bg-surface-alt"
                  >
                    <LxAvatar
                      name={user.displayName}
                      avatarUrl={user.avatarUrl}
                      size={32}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-[13px] text-text">
                        {user.displayName}
                      </span>
                      <span className="block truncate font-mono text-[11.5px] text-text-faint">
                        @{user.githubUsername}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {likers.status === 'CanLoadMore' && (
            <Button
              variant="monoOutline"
              size="meta"
              onClick={() => likers.loadMore(20)}
              className="mt-1 w-full font-mono"
            >
              load more
            </Button>
          )}
          {likers.status === 'LoadingMore' && (
            <div className="px-2 py-2 font-mono text-[11.5px] text-text-faint">
              loading more…
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
