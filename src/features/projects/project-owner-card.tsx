import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { StatusPill } from '@/components/ui/status-pill'
import { CityPill } from '@/components/ui/city-pill'
import { BrandIcon } from '@/components/ui/brand-icon'
import { Button } from '@/components/ui/button'
import { describeSyncFreshness } from '@/components/ui/project-card'
import type { ProjectDetailPayload } from '@/features/contracts'
import { useFollowUser, useUnfollowUser } from '@/features/follows/mutations'
import { useOpenConversation } from '@/features/inbox/use-open-conversation'
import { projectDetailQueryOptions } from '@/features/projects/queries'
import { useRefreshProjectSync } from '@/features/projects/use-refresh-project-sync'
import { reportActionError } from '@/lib/action-error'
import { showUndoToast } from '@/lib/undo-toast'
import { socialLinkHref } from '@/lib/social-links'

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
}: {
  detail: ProjectDetailPayload
  owner: string
  repo: string
  signals: FunctionReturnType<typeof api.projects.getProjectSignals> | null
  isOwnProject: boolean
  isSignedIn: boolean
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
  const ownerGithubHref = socialLinkHref('github', detail.owner.githubUsername)
  const ownerXHref = socialLinkHref('x', detail.owner.socialLinks.x)
  const ownerLinkedinHref = socialLinkHref(
    'linkedin',
    detail.owner.socialLinks.linkedin,
  )
  const ownerWebsiteHref = socialLinkHref(
    'website',
    detail.owner.socialLinks.website,
  )

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
    <div className="rounded-card border border-line bg-surface p-4.5">
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
            className="ring-1 ring-transparent ring-offset-2 ring-offset-surface transition-[box-shadow] group-hover:ring-brand/40"
          />
          <div className="min-w-0 flex-1">
            <div className="font-mono text-sm font-semibold text-text wrap-anywhere">
              {detail.owner.displayName}
            </div>
            <div className="font-mono text-label text-text-faint wrap-anywhere">
              @{detail.owner.githubUsername}
            </div>
          </div>
        </button>
        {ownerGithubHref && (
          <a
            href={ownerGithubHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-text-muted no-underline transition-colors hover:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label="GitHub profile"
          >
            <BrandIcon name="github" size={13} />
          </a>
        )}
      </div>

      <div className="mb-3.5 flex flex-wrap gap-2.5">
        <StatusPill status={detail.owner.buildStatus} size="md" />
        {ownerCityLabel && (
          <CityPill city={ownerCityLabel} cityId={ownerCityId} />
        )}
      </div>

      {!isOwnProject && (
        <div className="mb-3.5 flex flex-wrap gap-2">
          <Button
            size="meta"
            onClick={() => void openConversation(detail.owner.userId)}
            disabled={
              pendingUserId === String(detail.owner.userId) || !isSignedIn
            }
          >
            {pendingUserId === String(detail.owner.userId)
              ? 'opening…'
              : 'message'}
          </Button>
          <Button
            size="meta"
            onClick={() => void handleFollow()}
            disabled={followMutation.isPending || !isSignedIn}
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
            <p className="m-0 text-meta text-text-faint">
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

      <div className="flex flex-wrap gap-2.5 font-mono text-label">
        {ownerXHref && (
          <a
            href={ownerXHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 min-w-11 items-center text-text-muted no-underline"
          >
            x
          </a>
        )}
        {ownerLinkedinHref && (
          <a
            href={ownerLinkedinHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 min-w-11 items-center text-text-muted no-underline"
          >
            linkedin
          </a>
        )}
        {ownerWebsiteHref && (
          <a
            href={ownerWebsiteHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 min-w-11 items-center text-text-muted no-underline"
          >
            site
          </a>
        )}
      </div>
    </div>
  )
}
