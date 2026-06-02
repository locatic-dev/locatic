import type { Doc, Id } from '../../../../convex/_generated/dataModel'
import { EmptyState } from '@/components/ui/empty-state'
import { ProjectCard } from '@/components/ui/project-card'
import { isExploreUserFollowed } from '@/features/explore/state'
import type { BuilderPreview } from '@/features/explore/types'
import type { ProjectCardPreview } from '@/features/contracts'
import { toProjectCardData } from '@/features/project-card-preview'
import { NearbyBuilderRow } from './nearby-builder-row'

export function ExploreFeed({
  builderResults,
  builderSearchLoading,
  debouncedBuilderQuery,
  dismissedIds,
  followOverrides,
  followedUserIds,
  isBuilderSearchActive,
  isGlobalFeed,
  isProjectSearchActive,
  items,
  likedProjectIds,
  onDismissProject,
  onFollowUser,
  onLikeProject,
  onMessageUser,
  onOpenBuilderProfile,
  onOpenPostResult,
  onOpenProject,
  onOpenProjectOwner,
  pendingFollows,
  pendingLikes,
  pendingUserId,
  postResults,
  viewerId,
}: {
  builderResults: BuilderPreview[]
  builderSearchLoading: boolean
  debouncedBuilderQuery: string
  dismissedIds: Set<string>
  followOverrides: Record<string, boolean>
  followedUserIds: Set<string>
  isBuilderSearchActive: boolean
  isGlobalFeed: boolean
  isProjectSearchActive: boolean
  items: ProjectCardPreview[]
  likedProjectIds: Set<string>
  onDismissProject: (projectId: Id<'projects'>, projectKey: string) => void
  onFollowUser: (
    userId: Id<'users'>,
    userKey: string,
    currentlyFollowed: boolean,
  ) => void
  onLikeProject: (projectId: Id<'projects'>, projectKey: string) => void
  onMessageUser: (userId: Id<'users'>) => void
  onOpenBuilderProfile: (builder: BuilderPreview) => void
  onOpenPostResult: (target: {
    owner: string
    postId: Id<'posts'>
    repo: string
  }) => void
  onOpenProject: (project: ProjectCardPreview) => void
  onOpenProjectOwner: (project: ProjectCardPreview) => void
  pendingFollows: Set<string>
  pendingLikes: Set<string>
  pendingUserId: string | null
  postResults: Array<Doc<'posts'>>
  viewerId?: Id<'users'>
}) {
  const visibleItems = items.filter(
    (item) => !dismissedIds.has(String(item.projectId)),
  )
  const getFollowedState = (userId: Id<'users'>) =>
    isExploreUserFollowed({
      followOverrides,
      followedUserIds,
      userId,
    })

  return (
    <>
      {!isBuilderSearchActive &&
        !isProjectSearchActive &&
        !isGlobalFeed &&
        visibleItems.length === 0 && (
          <div className="py-10">
            <EmptyState
              title="no projects match these cities yet."
              description="Try another city, remove one of your selected filters, or check back after more projects are imported."
            />
          </div>
        )}

      {!isBuilderSearchActive &&
        !isProjectSearchActive &&
        isGlobalFeed &&
        visibleItems.length === 0 && (
          <div className="py-10">
            <EmptyState
              title="nothing to explore right now."
              description="Try searching for builders, add city filters, or check back after more projects are imported."
            />
          </div>
        )}

      {isBuilderSearchActive && builderSearchLoading && (
        <div className="py-5 text-center font-mono text-[12.5px] text-text-faint">
          searching builders…
        </div>
      )}

      {isBuilderSearchActive && builderResults.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-faint">
            matching builders
          </div>
          <div className="flex flex-col gap-2">
            {builderResults.map((builder) => (
              <NearbyBuilderRow
                key={builder.userId}
                builder={builder}
                onOpenProfile={() => onOpenBuilderProfile(builder)}
                onFollow={() =>
                  onFollowUser(
                    builder.userId,
                    String(builder.userId),
                    getFollowedState(builder.userId),
                  )
                }
                followed={getFollowedState(builder.userId)}
                followPending={pendingFollows.has(String(builder.userId))}
                onMessage={
                  viewerId && builder.userId !== viewerId
                    ? () => onMessageUser(builder.userId)
                    : undefined
                }
                messagePending={pendingUserId === String(builder.userId)}
                isSelf={builder.userId === viewerId}
              />
            ))}
          </div>
        </div>
      )}

      {isBuilderSearchActive &&
        builderResults.length === 0 &&
        !builderSearchLoading && (
          <div className="py-5 text-center font-mono text-[12.5px] text-text-faint">
            no builders found for &ldquo;{debouncedBuilderQuery}&rdquo;
          </div>
        )}

      {isProjectSearchActive &&
        visibleItems.length === 0 &&
        postResults.length === 0 && (
          <div className="py-5 text-center font-mono text-[12.5px] text-text-faint">
            no projects or posts found.
          </div>
        )}

      {isProjectSearchActive && postResults.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-faint">
            matching repo posts
          </div>
          <div className="flex flex-col gap-2">
            {postResults.map((post) => {
              const [owner = '', repo = post.projectSnapshot.name] =
                post.projectSnapshot.fullName.split('/')

              return (
                <button
                  key={String(post._id)}
                  type="button"
                  onClick={() =>
                    onOpenPostResult({
                      owner,
                      postId: post._id,
                      repo,
                    })
                  }
                  className="rounded-[6px] border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-line-strong hover:bg-surface-alt"
                >
                  <div className="mb-1 font-mono text-[12px] font-semibold text-text">
                    {post.projectSnapshot.fullName}
                  </div>
                  <p className="m-0 line-clamp-2 font-sans text-[13px] leading-6 text-text-muted">
                    {post.body}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!isBuilderSearchActive && visibleItems.length > 0 && (
        <div className="flex flex-col gap-3.5">
          {visibleItems.map((item, index) => {
            const projectId = item.projectId
            const projectKey = String(item.projectId)
            const ownerId = item.ownerUserId
            const ownerKey = String(ownerId)
            const liked = likedProjectIds.has(projectKey)
            const followed = getFollowedState(ownerId)

            return (
              <ProjectCard
                key={projectId}
                project={{
                  ...toProjectCardData(item),
                  liked,
                  followed,
                  isRecommended: index === 0,
                }}
                onDismiss={() => onDismissProject(projectId, projectKey)}
                onLike={() => onLikeProject(projectId, projectKey)}
                onAuthorClick={() => onOpenProjectOwner(item)}
                onFollow={() => onFollowUser(ownerId, ownerKey, followed)}
                onDM={
                  viewerId !== ownerId
                    ? () => onMessageUser(ownerId)
                    : undefined
                }
                onCardClick={() => onOpenProject(item)}
                likePending={pendingLikes.has(projectKey)}
                followPending={pendingFollows.has(ownerKey)}
                dmPending={pendingUserId === ownerKey}
              />
            )
          })}
        </div>
      )}
    </>
  )
}
