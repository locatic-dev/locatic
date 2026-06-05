import type { Id } from '../../../../convex/_generated/dataModel'
import { EmptyState } from '@/components/ui/empty-state'
import { ProjectCard } from '@/components/ui/project-card'
import { isExploreUserFollowed } from '@/features/explore/state'
import { relativeTime } from '@/lib/time'
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
  followOverrides,
  followedUserIds,
  isBuilderSearchActive,
  isBuildersMode,
  isGlobalFeed,
  isPostSearchActive,
  isPostsMode,
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
  postSearchLoading,
  postResults,
  viewerId,
}: {
  builderResults: BuilderPreview[]
  builderSearchLoading: boolean
  debouncedSearchQuery: string
  dismissedIds: Set<string>
  followOverrides: Record<string, boolean>
  followedUserIds: Set<string>
  isBuilderSearchActive: boolean
  isBuildersMode: boolean
  isGlobalFeed: boolean
  isPostSearchActive: boolean
  isPostsMode: boolean
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
  postSearchLoading: boolean
  postResults: ExplorePostPreview[]
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
      {!isBuildersMode &&
        !isPostsMode &&
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

      {!isBuildersMode &&
        !isPostsMode &&
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

      {isBuildersMode && builderSearchLoading && (
        <div className="py-5 text-center font-mono text-[12.5px] text-text-faint">
          searching builders…
        </div>
      )}

      {isBuildersMode && builderResults.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-faint">
            {isBuilderSearchActive ? 'matching builders' : 'builders'}
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
        visibleItems.length === 0 && (
          <div className="py-5 text-center font-mono text-[12.5px] text-text-faint">
            no projects found.
          </div>
        )}

      {isPostsMode && !isPostSearchActive && (
        <div className="py-10">
          <EmptyState
            title="search posts by body or topic."
            description="Try a phrase from an update, or search a project topic with or without a hash."
          />
        </div>
      )}

      {isPostsMode && postSearchLoading && (
        <div className="py-5 text-center font-mono text-[12.5px] text-text-faint">
          searching posts…
        </div>
      )}

      {isPostsMode &&
        isPostSearchActive &&
        postResults.length === 0 &&
        !postSearchLoading && (
          <div className="py-5 text-center font-mono text-[12.5px] text-text-faint">
            no posts found for &ldquo;{debouncedSearchQuery}&rdquo;
          </div>
        )}

      {isPostsMode && !postSearchLoading && postResults.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-faint">
            matching posts
          </div>
          <div className="flex flex-col gap-2">
            {postResults.map((post) => {
              const [rawOwner = '', rawRepo = post.projectSnapshot.name] =
                post.projectSnapshot.fullName.split('/')
              const owner = rawOwner || post.projectSnapshot.fullName
              const repo = rawRepo || post.projectSnapshot.name

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
                  <div className="mb-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-text-faint">
                    <span className="font-semibold text-text">
                      {post.projectSnapshot.fullName}
                    </span>
                    <span>{relativeTime(post.createdAt)}</span>
                    {post.actorSnapshot.displayName && (
                      <span>by {post.actorSnapshot.displayName}</span>
                    )}
                  </div>
                  <p className="m-0 line-clamp-2 font-sans text-[13px] leading-6 text-text-muted">
                    {post.body}
                  </p>
                  {post.projectTopics.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {post.projectTopics.slice(0, 4).map((topic) => (
                        <span
                          key={topic}
                          className="rounded-pill border border-line px-2 py-1 font-mono text-[10.5px] text-text-faint"
                        >
                          #{topic}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!isBuildersMode && !isPostsMode && visibleItems.length > 0 && (
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
