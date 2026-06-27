import type { Id } from '../../../../convex/_generated/dataModel'
import { Link } from '@tanstack/react-router'
import { EmptyState } from '@/components/ui/empty-state'
import { ProjectCard } from '@/components/ui/project-card'
import { isExploreUserFollowed } from '@/features/explore/state'
import { relativeTime } from '@/lib/time'
import { X } from '@/lib/icons'
import type {
  BuilderPreview,
  ExplorePostPreview,
} from '@/features/explore/types'
import type { ProjectCardPreview } from '@/features/contracts'
import { toProjectCardData } from '@/features/project-card-preview'
import { NearbyBuilderRow } from './nearby-builder-row'

export function ExploreFeed({
  builderResults,
  builderSearchLoading,
  debouncedSearchQuery,
  dismissedIds,
  dismissedPostIds,
  followOverrides,
  followedUserIds,
  hasMoreProjects,
  hasMorePosts,
  isBuilderSearchActive,
  isBuildersMode,
  isGlobalFeed,
  isPostSearchActive,
  isPostsMode,
  isProjectSearchActive,
  items,
  likedProjectIds,
  loadMorePending,
  onDismissPost,
  onDismissProject,
  onFollowUser,
  onLikeProject,
  onLoadMoreProjects,
  onLoadMorePosts,
  onMessageUser,
  onOpenBuilderProfile,
  pendingFollows,
  pendingLikes,
  pendingUserId,
  projectFeedLoading,
  projectSearchLoading,
  postSearchLoading,
  postResults,
  viewerId,
}: {
  builderResults: BuilderPreview[]
  builderSearchLoading: boolean
  debouncedSearchQuery: string
  dismissedIds: Set<string>
  dismissedPostIds: Set<string>
  followOverrides: Record<string, boolean>
  followedUserIds: Set<string>
  hasMoreProjects: boolean
  hasMorePosts: boolean
  isBuilderSearchActive: boolean
  isBuildersMode: boolean
  isGlobalFeed: boolean
  isPostSearchActive: boolean
  isPostsMode: boolean
  isProjectSearchActive: boolean
  items: ProjectCardPreview[]
  likedProjectIds: Set<string>
  loadMorePending: boolean
  onDismissPost: (postId: Id<'posts'>, postKey: string) => void
  onDismissProject: (projectId: Id<'projects'>, projectKey: string) => void
  onFollowUser: (
    userId: Id<'users'>,
    userKey: string,
    currentlyFollowed: boolean,
  ) => void
  onLikeProject: (projectId: Id<'projects'>, projectKey: string) => void
  onLoadMoreProjects: () => void
  onLoadMorePosts: () => void
  onMessageUser: (userId: Id<'users'>) => void
  onOpenBuilderProfile: (builder: BuilderPreview) => void
  pendingFollows: Set<string>
  pendingLikes: Set<string>
  pendingUserId: string | null
  projectFeedLoading: boolean
  projectSearchLoading: boolean
  postSearchLoading: boolean
  postResults: ExplorePostPreview[]
  viewerId?: Id<'users'>
}) {
  const visibleItems = items.filter(
    (item) => !dismissedIds.has(String(item.projectId)),
  )
  const visiblePostResults = postResults.filter(
    (post) => !dismissedPostIds.has(String(post._id)),
  )
  const getFollowedState = (userId: Id<'users'>) =>
    isExploreUserFollowed({
      followOverrides,
      followedUserIds,
      userId,
    })

  return (
    <>
      {!isBuildersMode &&
        !isPostsMode &&
        !isProjectSearchActive &&
        !isGlobalFeed &&
        !projectFeedLoading &&
        visibleItems.length === 0 && (
          <div className="py-10">
            <EmptyState
              title="no projects match these cities yet."
              description="Try another city, remove one of your selected filters, or check back after more projects are imported."
            />
          </div>
        )}

      {!isBuildersMode &&
        !isPostsMode &&
        !isProjectSearchActive &&
        isGlobalFeed &&
        !projectFeedLoading &&
        visibleItems.length === 0 && (
          <div className="py-10">
            <EmptyState
              title="nothing to explore right now."
              description="Try searching for builders, add city filters, or check back after more projects are imported."
            />
          </div>
        )}

      {isBuildersMode && builderSearchLoading && (
        <div className="py-5 text-center font-mono text-[12.5px] text-text-faint">
          searching builders…
        </div>
      )}

      {isBuildersMode && builderResults.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-muted">
            {isBuilderSearchActive ? 'matching builders' : 'builders'}
          </div>
          <div className="flex flex-col gap-3">
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

      {isBuildersMode &&
        builderResults.length === 0 &&
        !builderSearchLoading && (
          <div className="py-5 text-center font-mono text-[12.5px] text-text-faint">
            {isBuilderSearchActive
              ? `no builders found for "${debouncedSearchQuery}"`
              : 'no builders found for this city context.'}
          </div>
        )}

      {!isBuildersMode &&
        !isPostsMode &&
        isProjectSearchActive &&
        !projectSearchLoading &&
        visibleItems.length === 0 && (
          <div className="py-5 text-center font-mono text-[12.5px] text-text-faint">
            no projects found.
          </div>
        )}

      {isPostsMode &&
        !isPostSearchActive &&
        visiblePostResults.length === 0 &&
        !postSearchLoading && (
          <div className="py-10">
            <EmptyState
              title={
                isGlobalFeed
                  ? 'no posts to explore right now.'
                  : 'no posts found for this city context.'
              }
              description={
                isGlobalFeed
                  ? 'Try searching for a phrase or check back after more project posts are published.'
                  : 'Try another city, remove one of your selected filters, or search post text directly.'
              }
            />
          </div>
        )}

      {isPostsMode && postSearchLoading && (
        <div className="py-5 text-center font-mono text-[12.5px] text-text-faint">
          {isPostSearchActive ? 'searching posts…' : 'loading posts…'}
        </div>
      )}

      {isPostsMode &&
        isPostSearchActive &&
        visiblePostResults.length === 0 &&
        !postSearchLoading && (
          <div className="py-5 text-center font-mono text-[12.5px] text-text-faint">
            no posts found for &ldquo;{debouncedSearchQuery}&rdquo;
          </div>
        )}

      {isPostsMode && !postSearchLoading && visiblePostResults.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-muted">
            {isPostSearchActive ? 'matching posts' : 'posts'}
          </div>
          <div className="flex flex-col gap-3">
            {visiblePostResults.map((post) => (
              <div
                key={String(post._id)}
                className="lx-card flex items-start gap-2 rounded-card border border-line bg-surface"
              >
                <Link
                  to="/project/$owner/$repo"
                  params={{
                    owner:
                      post.projectSnapshot.ownerLogin ??
                      post.projectSnapshot.fullName.split('/')[0] ??
                      post.projectSnapshot.fullName,
                    repo: post.projectSnapshot.name,
                  }}
                  search={{ post: String(post._id) }}
                  hash={`post-${String(post._id)}`}
                  preload="intent"
                  className="min-w-0 flex-1 px-4 py-3.5 text-left"
                >
                  {/* Repo attribution — quiet mono prefix */}
                  <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-text-faint">
                    <span className="text-text-muted">
                      {post.projectSnapshot.fullName}
                    </span>
                    <span>{relativeTime(post.createdAt)}</span>
                    {post.actorSnapshot.displayName && (
                      <span>by {post.actorSnapshot.displayName}</span>
                    )}
                  </div>
                  {/* Post body leads — this is the content */}
                  <p className="m-0 line-clamp-2 font-sans text-[14px] leading-6 text-text">
                    {post.body}
                  </p>
                  {post.projectTopics.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {post.projectTopics.slice(0, 4).map((topic) => (
                        <span
                          key={topic}
                          className="rounded-control border border-line px-2 py-0.5 font-mono text-[10.5px] text-text-muted"
                        >
                          #{topic}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
                <button
                  type="button"
                  onClick={() => onDismissPost(post._id, String(post._id))}
                  aria-label="Dismiss post"
                  className="mt-1 mr-1 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md border-none bg-transparent text-text-faint transition-colors hover:text-text"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          {hasMorePosts && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={onLoadMorePosts}
                disabled={loadMorePending}
                className="min-h-11 rounded-md border border-line px-4 py-2 font-mono text-[12px] text-text-muted transition-colors hover:border-line-strong hover:text-text disabled:cursor-default disabled:opacity-60"
              >
                {loadMorePending ? 'loading…' : 'load more posts'}
              </button>
            </div>
          )}
        </div>
      )}

      {!isBuildersMode && !isPostsMode && visibleItems.length > 0 && (
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-3.5">
            {visibleItems.map((item) => {
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
                  }}
                  onDismiss={() => onDismissProject(projectId, projectKey)}
                  onLike={() => onLikeProject(projectId, projectKey)}
                  authorLink={{ username: item.authorHandle }}
                  onFollow={() => onFollowUser(ownerId, ownerKey, followed)}
                  onDM={
                    viewerId !== ownerId
                      ? () => onMessageUser(ownerId)
                      : undefined
                  }
                  projectLink={{ owner: item.owner, repo: item.repo }}
                  likePending={pendingLikes.has(projectKey)}
                  followPending={pendingFollows.has(ownerKey)}
                  dmPending={pendingUserId === ownerKey}
                />
              )
            })}
          </div>
          {hasMoreProjects && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={onLoadMoreProjects}
                disabled={loadMorePending}
                className="min-h-11 rounded-md border border-line px-4 py-2 font-mono text-[12px] text-text-muted transition-colors hover:border-line-strong hover:text-text disabled:cursor-default disabled:opacity-60"
              >
                {loadMorePending ? 'loading…' : 'load more projects'}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
