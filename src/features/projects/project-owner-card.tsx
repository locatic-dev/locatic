import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useRouter } from '@tanstack/react-router'
import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { StatusPill } from '@/components/ui/status-pill'
import { CityPill } from '@/components/ui/city-pill'
import { Button } from '@/components/ui/button'
import { SocialLinks } from '@/components/ui/social-links'
import { describeSyncFreshness } from '@/components/ui/project-card'
import type { ProjectDetailPayload } from '@/features/contracts'
import { useFollowUser, useUnfollowUser } from '@/features/follows/mutations'
import { useOpenConversation } from '@/features/inbox/use-open-conversation'
import { projectDetailQueryOptions } from '@/features/projects/queries'
import { useRefreshProjectSync } from '@/features/projects/use-refresh-project-sync'
import { reportActionError } from '@/lib/action-error'
import { showUndoToast } from '@/lib/undo-toast'

function updateProjectFollowPayload(
  payload: ProjectDetailPayload | null | undefined,
  nextFollowed: boolean,
) {
  if (!payload) {
    return payload
  }

  return {
    ...payload,
    viewerFollowsOwner: nextFollowed,
  }
}

/** Owner disclosure and owner actions stay together, independent of project tabs. */
export function ProjectOwnerCard({
  detail,
  owner,
  repo,
  signals,
  isOwnProject,
  isSignedIn,
  signInRedirect,
}: {
  detail: ProjectDetailPayload
  owner: string
  repo: string
  signals: FunctionReturnType<typeof api.projects.getProjectSignals> | null
  isOwnProject: boolean
  /** Clerk's tri-state: `undefined` while auth is still loading. */
  isSignedIn: boolean | undefined
  /** Where sign-in returns a visitor who wants to follow the owner. */
  signInRedirect: string | undefined
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const followUser = useFollowUser()
  const unfollowUser = useUnfollowUser()
  const { openConversation, pendingUserId } = useOpenConversation()
  const projectDetailQueryKey = projectDetailQueryOptions({
    owner,
    repo,
  }).queryKey
  const followed = detail.viewerFollowsOwner
  const followMutation = useMutation({
    mutationFn: async ({
      currentlyFollowed,
      userId,
    }: {
      currentlyFollowed: boolean
      userId: ProjectDetailPayload['owner']['userId']
    }) =>
      currentlyFollowed
        ? unfollowUser({ targetUserId: userId })
        : followUser({ targetUserId: userId }),
    onMutate: async ({ currentlyFollowed }) => {
      await queryClient.cancelQueries({ queryKey: projectDetailQueryKey })
      const previous = queryClient.getQueryData<ProjectDetailPayload | null>(
        projectDetailQueryKey,
      )

      queryClient.setQueryData<ProjectDetailPayload | null>(
        projectDetailQueryKey,
        (current) =>
          updateProjectFollowPayload(current, !currentlyFollowed) ?? null,
      )

      return { previous }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(projectDetailQueryKey, context?.previous ?? null)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: projectDetailQueryKey })
    },
  })

  const projectSync = useRefreshProjectSync(() =>
    queryClient.invalidateQueries({ queryKey: projectDetailQueryKey }),
  )
  const refreshingSync = projectSync.pendingProjectId !== null
  // The detail payload carries the disclosed label; the signals add the city
  // id (exact-city owners only) so the pill can link to city Explore.
  const ownerLocation = signals?.ownerLocation
  const ownerCityLabel =
    ownerLocation?.kind === 'city'
      ? ownerLocation.cityName
      : ownerLocation?.kind === 'region'
        ? ownerLocation.regionLabel
        : ownerLocation?.kind === 'none'
          ? null
          : detail.owner.city
  const ownerCityId =
    ownerLocation?.kind === 'city' ? String(ownerLocation.cityId) : null

  const handleFollow = async () => {
    if (followMutation.isPending || !isSignedIn || isOwnProject) {
      return
    }

    const userId = detail.owner.userId
    try {
      await followMutation.mutateAsync({ currentlyFollowed: followed, userId })
    } catch (error) {
      reportActionError(error, {
        title: followed ? "couldn't unfollow" : "couldn't follow",
        retry: handleFollow,
      })
      return
    }

    if (followed) {
      showUndoToast({
        message: `unfollowed @${detail.owner.githubUsername}`,
        undo: () =>
          followMutation.mutateAsync({ currentlyFollowed: false, userId }),
      })
    }
  }

  return (
    <div className="rounded-card border border-line p-4.5">
      <p className="m-0 mb-3 text-eyebrow text-text-muted">builder</p>
      <div className="mb-3.5 flex w-full items-center gap-2">
        <button
          type="button"
          onClick={() =>
            void router.navigate({
              to: '/u/$username',
              params: {
                username: detail.owner.githubUsername,
              },
              search: { tab: 'projects' },
            })
          }
          className="group flex min-w-0 flex-1 items-center gap-3 border-0 bg-transparent p-0 text-left"
        >
          <LxAvatar
            name={detail.owner.displayName}
            avatarUrl={detail.owner.avatarUrl}
            size={48}
            className="ring-1 ring-transparent ring-offset-2 ring-offset-canvas transition-[box-shadow] group-hover:ring-brand/40"
          />
          <div className="min-w-0 flex-1">
            <div className="text-title text-text wrap-anywhere">
              {detail.owner.displayName}
            </div>
            <div className="font-mono text-meta text-text-muted wrap-anywhere">
              @{detail.owner.githubUsername}
            </div>
          </div>
        </button>
      </div>

      <div className="mb-3.5 flex flex-wrap gap-2.5">
        <StatusPill status={detail.owner.buildStatus} size="md" />
        {ownerCityLabel && (
          <CityPill city={ownerCityLabel} cityId={ownerCityId} />
        )}
      </div>

      {!isOwnProject && isSignedIn === false && (
        <div className="mb-3.5 flex flex-wrap gap-2">
          <Button asChild size="meta">
            <Link to="/sign-in/$" search={{ redirect: signInRedirect }}>
              sign in to follow
            </Link>
          </Button>
        </div>
      )}

      {!isOwnProject && isSignedIn === undefined && (
        // Clerk is still loading: hold the row's space with a quiet control.
        <div className="mb-3.5 flex flex-wrap gap-2">
          <Button size="meta" disabled>
            follow
          </Button>
        </div>
      )}

      {!isOwnProject && isSignedIn === true && (
        <div className="mb-3.5 flex flex-wrap gap-2">
          <Button
            size="meta"
            onClick={() => void openConversation(detail.owner.userId)}
            disabled={pendingUserId === String(detail.owner.userId)}
          >
            {pendingUserId === String(detail.owner.userId)
              ? 'opening…'
              : 'message'}
          </Button>
          <Button
            size="meta"
            // Solid accent until followed, then a quiet "following".
            variant={followed ? 'ghost' : 'primary'}
            onClick={() => void handleFollow()}
            disabled={followMutation.isPending}
          >
            {followMutation.isPending
              ? 'working…'
              : followed
                ? 'following'
                : 'follow'}
          </Button>
        </div>
      )}

      {isOwnProject && signals && (
        <div className="mb-3.5 flex flex-col gap-2 border-t border-line pt-3.5">
          {signals.syncStatus.kind === 'failed' ? (
            <p
              role="status"
              className="m-0 text-meta text-danger wrap-anywhere"
            >
              last refresh from GitHub failed
              {signals.syncStatus.error ? `: ${signals.syncStatus.error}` : ''}
            </p>
          ) : (
            <p className="m-0 text-meta text-text-muted">
              {describeSyncFreshness(signals.syncStatus)}
            </p>
          )}
          <div>
            <Button
              size="meta"
              onClick={() => void projectSync.refresh(detail.project._id)}
              disabled={refreshingSync}
            >
              {refreshingSync
                ? 'refreshing…'
                : signals.syncStatus.kind === 'failed'
                  ? 'retry refresh'
                  : 'refresh from GitHub'}
            </Button>
          </div>
        </div>
      )}

      <SocialLinks
        githubUsername={detail.owner.githubUsername}
        links={detail.owner.socialLinks}
        className="mt-1"
      />
    </div>
  )
}
