import { useState, type ReactNode } from 'react'
import * as m from 'motion/react-m'
import type { Id } from '../../../../convex/_generated/dataModel'
import { Link } from '@tanstack/react-router'
import { EmptyState } from '@/components/ui/empty-state'
import { ProjectCard, ProjectCardSkeleton } from '@/components/ui/project-card'
import { Skeleton } from '@/components/ui/skeleton'
import { isExploreUserFollowed } from '@/features/explore/state'
import { EXPLORE_PAGINATED_PAGE_SIZE } from '@/features/explore/pagination'
import { relativeTime } from '@/lib/time'
import { Compass, X } from '@/lib/icons'
import { fadeUp, listStagger, pressScale } from '@/lib/motion'
import type {
  BuilderPreview,
  ExplorePostPreview,
} from '@/features/explore/types'
import type { ProjectCardPreview } from '@/features/contracts'
import { toProjectCardData } from '@/features/project-card-preview'
import { NearbyBuilderRow } from './nearby-builder-row'

function getInitialPageKeys<T>(items: T[], getKey: (item: T) => string) {
  return new Set(items.slice(0, EXPLORE_PAGINATED_PAGE_SIZE).map(getKey))
}

function InitialPageMotionList<T>({
  children,
  getKey,
  items,
  motionClassName,
  className,
}: {
  children: (item: T) => ReactNode
  getKey: (item: T) => string
  items: T[]
  motionClassName?: string
  className: string
}) {
  const [initialKeys] = useState(() => getInitialPageKeys(items, getKey))

  return (
    <m.div
      className={className}
      variants={listStagger}
      initial="hidden"
      animate="visible"
    >
      {items.map((item) => {
        const key = getKey(item)
        const row = children(item)

        return initialKeys.has(key) ? (
          <m.div key={key} variants={fadeUp} className={motionClassName}>
            {row}
          </m.div>
        ) : (
          <div key={key} className={motionClassName}>
            {row}
          </div>
        )
      })}
    </m.div>
  )
}

const cardPressClass =
  'transition-transform duration-150 ease-out active:scale-[0.98]'

function PostRowSkeleton() {
  return (
    <div className="flex items-start gap-2 rounded-card border border-line bg-surface px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="mt-2 h-3.5 w-4/5" />
        <div className="mt-3 flex gap-1.5">
          <Skeleton className="h-5 w-14 rounded-control" />
          <Skeleton className="h-5 w-16 rounded-control" />
        </div>
      </div>
    </div>
  )
}

function BuilderRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3.5">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="mt-2 h-3 w-40" />
      </div>
      <Skeleton className="h-11 w-22 shrink-0 rounded-md" />
    </div>
  )
}

export function ExploreFeed({
  builderFeedLoading,
  builderResults,
  builderSearchLoading,
  canLoadMoreBuilders,
  debouncedSearchQuery,
  dismissedIds,
  dismissedPostIds,
  entranceKey,
  followOverrides,
  followedUserIds,
  hasMoreProjects,
  hasMorePosts,
  isBuilderSearchActive,
  isBuildersMode,
  isGlobalFeed,
  isLoadingMoreBuilders,
  isPostSearchActive,
  isPostsMode,
  isProjectSearchActive,
  items,
  likedProjectIds,
  loadMorePending,
  onClearCityFilters,
  onDismissPost,
  onDismissProject,
  onFollowUser,
  onLikeProject,
  onLoadMoreBuilders,
  onLoadMoreProjects,
  onLoadMorePosts,
  onMessageUser,
  onOpenBuilderProfile,
  onResetExplore,
  pendingFollows,
  pendingLikes,
  pendingUserId,
  projectFeedLoading,
  projectSearchLoading,
  postSearchLoading,
  postResults,
  resetPending,
  viewerId,
}: {
  builderFeedLoading?: boolean
  builderResults: BuilderPreview[]
  builderSearchLoading: boolean
  canLoadMoreBuilders: boolean
  debouncedSearchQuery: string
  dismissedIds: Set<string>
  dismissedPostIds: Set<string>
  entranceKey: string
  followOverrides: Record<string, boolean>
  followedUserIds: Set<string>
  hasMoreProjects: boolean
  hasMorePosts: boolean
  isBuilderSearchActive: boolean
  isBuildersMode: boolean
  isGlobalFeed: boolean
  isLoadingMoreBuilders: boolean
  isPostSearchActive: boolean
  isPostsMode: boolean
  isProjectSearchActive: boolean
  items: ProjectCardPreview[]
  likedProjectIds: Set<string>
  loadMorePending: boolean
  onClearCityFilters?: () => void
  onDismissPost: (postId: Id<'posts'>, postKey: string) => void
  onDismissProject: (projectId: Id<'projects'>, projectKey: string) => void
  onFollowUser: (
    userId: Id<'users'>,
    userKey: string,
    currentlyFollowed: boolean,
  ) => void
  onLikeProject: (projectId: Id<'projects'>, projectKey: string) => void
  onLoadMoreBuilders: () => void
  onLoadMoreProjects: () => void
  onLoadMorePosts: () => void
  onMessageUser: (userId: Id<'users'>) => void
  onOpenBuilderProfile: (builder: BuilderPreview) => void
  onResetExplore?: () => void
  pendingFollows: Set<string>
  pendingLikes: Set<string>
  pendingUserId: string | null
  projectFeedLoading: boolean
  projectSearchLoading: boolean
  postSearchLoading: boolean
  postResults: ExplorePostPreview[]
  resetPending?: boolean
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

  const isProjectFeedLoading =
    (projectFeedLoading || (isProjectSearchActive && projectSearchLoading)) &&
    visibleItems.length === 0
  const isBuilderFeedLoading =
    (builderSearchLoading || (!isBuilderSearchActive && builderFeedLoading)) &&
    builderResults.length === 0

  return (
    <>
      {!isBuildersMode &&
        !isPostsMode &&
        !isProjectSearchActive &&
        !isGlobalFeed &&
        !projectFeedLoading &&
        visibleItems.length === 0 && (
          <div className="py-6">
            <EmptyState
              icon={<Compass size={28} strokeWidth={1.2} />}
              title="no projects match these cities yet."
              description="Try another city, remove one of your selected filters, or check back after more projects are imported."
              action={
                onResetExplore
                  ? {
                      label: resetPending ? 'resetting…' : 'reset dismissed',
                      onClick: onResetExplore,
                    }
                  : undefined
              }
              secondaryAction={
                onClearCityFilters
                  ? { label: 'clear city filters', onClick: onClearCityFilters }
                  : undefined
              }
            />
          </div>
        )}

      {!isBuildersMode &&
        !isPostsMode &&
        !isProjectSearchActive &&
        isGlobalFeed &&
        !projectFeedLoading &&
        visibleItems.length === 0 && (
          <div className="py-6">
            <EmptyState
              icon={<Compass size={28} strokeWidth={1.2} />}
              title="nothing to explore right now."
              description="Try searching for builders, add city filters, or check back after more projects are imported."
              action={
                onResetExplore
                  ? {
                      label: resetPending ? 'resetting…' : 'reset dismissed',
                      onClick: onResetExplore,
                    }
                  : undefined
              }
            />
          </div>
        )}

      {isBuildersMode && isBuilderFeedLoading && (
        <div
          role="status"
          aria-label={
            isBuilderSearchActive ? 'searching builders…' : 'loading builders…'
          }
          className="mb-8 flex flex-col gap-3"
        >
          {[0, 1, 2].map((index) => (
            <BuilderRowSkeleton key={index} />
          ))}
        </div>
      )}

      {isBuildersMode && !isBuilderFeedLoading && builderResults.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-muted">
            {isBuilderSearchActive ? 'matching builders' : 'builders'}
          </div>
          <InitialPageMotionList
            key={`builders:${entranceKey}`}
            className="flex flex-col gap-3"
            items={builderResults}
            getKey={(builder) => String(builder.userId)}
            motionClassName={cardPressClass}
          >
            {(builder) => (
              <NearbyBuilderRow
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
            )}
          </InitialPageMotionList>
          {canLoadMoreBuilders && (
            <div className="mt-4 flex justify-center">
              <m.button
                type="button"
                onClick={onLoadMoreBuilders}
                disabled={isLoadingMoreBuilders}
                whileTap={isLoadingMoreBuilders ? undefined : pressScale}
                className="min-h-11 rounded-md border border-line px-4 font-mono text-[12px] text-text-muted transition-colors hover:border-line-strong hover:text-text disabled:cursor-default disabled:opacity-60"
              >
                {isLoadingMoreBuilders ? 'loading…' : 'load more builders'}
              </m.button>
            </div>
          )}
        </div>
      )}

      {isBuildersMode &&
        !isBuilderFeedLoading &&
        builderResults.length === 0 && (
          <div className="py-6">
            <EmptyState
              icon={<Compass size={28} strokeWidth={1.2} />}
              title={
                isBuilderSearchActive
                  ? `no builders found for “${debouncedSearchQuery}”.`
                  : 'no builders found for this city context.'
              }
              description={
                isBuilderSearchActive
                  ? 'Try a different name or username.'
                  : 'Try another city or check back once more builders join nearby.'
              }
            />
          </div>
        )}

      {!isBuildersMode &&
        !isPostsMode &&
        isProjectSearchActive &&
        !projectSearchLoading &&
        visibleItems.length === 0 && (
          <div className="py-6">
            <EmptyState
              icon={<Compass size={28} strokeWidth={1.2} />}
              title="no projects found."
              description="Try a different search term or check the spelling."
            />
          </div>
        )}

      {isPostsMode &&
        !isPostSearchActive &&
        visiblePostResults.length === 0 &&
        !postSearchLoading && (
          <div className="py-6">
            <EmptyState
              icon={<Compass size={28} strokeWidth={1.2} />}
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
              action={
                onResetExplore
                  ? {
                      label: resetPending ? 'resetting…' : 'reset dismissed',
                      onClick: onResetExplore,
                    }
                  : undefined
              }
              secondaryAction={
                !isGlobalFeed && onClearCityFilters
                  ? { label: 'clear city filters', onClick: onClearCityFilters }
                  : undefined
              }
            />
          </div>
        )}

      {isPostsMode && postSearchLoading && (
        <div
          role="status"
          aria-label={
            isPostSearchActive ? 'searching posts…' : 'loading posts…'
          }
          className="flex flex-col gap-3"
        >
          {[0, 1, 2].map((index) => (
            <PostRowSkeleton key={index} />
          ))}
        </div>
      )}

      {isPostsMode &&
        isPostSearchActive &&
        visiblePostResults.length === 0 &&
        !postSearchLoading && (
          <div className="py-6">
            <EmptyState
              icon={<Compass size={28} strokeWidth={1.2} />}
              title={`no posts found for “${debouncedSearchQuery}”.`}
              description="Try a different phrase or topic."
            />
          </div>
        )}

      {isPostsMode && !postSearchLoading && visiblePostResults.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-muted">
            {isPostSearchActive ? 'matching posts' : 'posts'}
          </div>
          <InitialPageMotionList
            key={`posts:${entranceKey}`}
            className="flex flex-col gap-3"
            items={visiblePostResults}
            getKey={(post) => String(post._id)}
          >
            {(post) => (
              <div
                className={`lx-card flex items-start gap-2 rounded-card border border-line bg-surface ${cardPressClass}`}
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
                  className="mt-1 mr-1 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md border-none bg-transparent text-text-muted transition-colors hover:text-text"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
            )}
          </InitialPageMotionList>
          {hasMorePosts && (
            <div className="mt-4 flex justify-center">
              <m.button
                type="button"
                onClick={onLoadMorePosts}
                disabled={loadMorePending}
                whileTap={loadMorePending ? undefined : pressScale}
                className="min-h-11 rounded-md border border-line px-4 font-mono text-[12px] text-text-muted transition-colors hover:border-line-strong hover:text-text disabled:cursor-default disabled:opacity-60"
              >
                {loadMorePending ? 'loading…' : 'load more posts'}
              </m.button>
            </div>
          )}
        </div>
      )}

      {!isBuildersMode && !isPostsMode && isProjectFeedLoading && (
        <div
          role="status"
          aria-label={
            isProjectSearchActive ? 'searching projects…' : 'loading projects…'
          }
          className="flex flex-col gap-3.5"
        >
          {[0, 1, 2].map((index) => (
            <ProjectCardSkeleton key={index} />
          ))}
        </div>
      )}

      {!isBuildersMode && !isPostsMode && visibleItems.length > 0 && (
        <div className="flex flex-col gap-3.5">
          <InitialPageMotionList
            key={`projects:${entranceKey}`}
            className="flex flex-col gap-3.5"
            items={visibleItems}
            getKey={(item) => String(item.projectId)}
            motionClassName={cardPressClass}
          >
            {(item) => {
              const projectId = item.projectId
              const projectKey = String(item.projectId)
              const ownerId = item.ownerUserId
              const ownerKey = String(ownerId)
              const liked = likedProjectIds.has(projectKey)
              const followed = getFollowedState(ownerId)

              return (
                <ProjectCard
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
            }}
          </InitialPageMotionList>
          {hasMoreProjects && (
            <div className="flex justify-center pt-1">
              <m.button
                type="button"
                onClick={onLoadMoreProjects}
                disabled={loadMorePending}
                whileTap={loadMorePending ? undefined : pressScale}
                className="min-h-11 rounded-md border border-line px-4 font-mono text-[12px] text-text-muted transition-colors hover:border-line-strong hover:text-text disabled:cursor-default disabled:opacity-60"
              >
                {loadMorePending ? 'loading…' : 'load more projects'}
              </m.button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
