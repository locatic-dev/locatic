import { useState, type ReactNode } from 'react'
import * as m from 'motion/react-m'
import type { Id } from '../../../../convex/_generated/dataModel'
import { EmptyState } from '@/components/ui/empty-state'
import { ProjectCard, ProjectCardSkeleton } from '@/components/ui/project-card'
import { CardSheet, cardSheetClass } from '@/components/ui/card-sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { isExploreUserFollowed } from '@/features/explore/state'
import { EXPLORE_PAGINATED_PAGE_SIZE } from '@/features/explore/pagination'
import { Compass } from '@/lib/icons'
import { fadeUp, listStagger, pressScale } from '@/lib/motion'
import type {
  BuilderPreview,
  ExplorePostPreview,
} from '@/features/explore/types'
import type { ProjectCardPreview } from '@/features/contracts'
import { toProjectCardData } from '@/features/project-card-preview'
import { NearbyBuilderRow } from './nearby-builder-row'
import { ExplorePostCard } from './explore-post-card'
import { ProjectReactionBar } from '@/features/projects/reactions/project-reaction-bar'

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

function PostRowSkeleton() {
  return (
    <div className="flex items-start gap-2 bg-surface px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2.5">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-1.5 h-2.5 w-36" />
          </div>
        </div>
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="mt-2 h-3.5 w-4/5" />
      </div>
    </div>
  )
}

function BuilderRowSkeleton() {
  return (
    <div className="flex items-center gap-3 bg-surface px-5 py-4">
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
  onLoadMoreBuilders,
  onLoadMoreProjects,
  onLoadMorePosts,
  onMessageUser,
  onOpenBuilderProfile,
  onResetExplore,
  pendingFollows,
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
  onLoadMoreBuilders: () => void
  onLoadMoreProjects: () => void
  onLoadMorePosts: () => void
  onMessageUser: (userId: Id<'users'>) => void
  onOpenBuilderProfile: (builder: BuilderPreview) => void
  onResetExplore?: () => void
  pendingFollows: Set<string>
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
        <CardSheet
          role="status"
          aria-label={
            isBuilderSearchActive ? 'searching builders…' : 'loading builders…'
          }
          className="mb-8"
        >
          {[0, 1, 2].map((index) => (
            <BuilderRowSkeleton key={index} />
          ))}
        </CardSheet>
      )}

      {isBuildersMode && !isBuilderFeedLoading && builderResults.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-muted">
            {isBuilderSearchActive ? 'matching builders' : 'builders'}
          </div>
          <InitialPageMotionList
            key={`builders:${entranceKey}`}
            className={cardSheetClass}
            items={builderResults}
            getKey={(builder) => String(builder.userId)}
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
        <CardSheet
          role="status"
          aria-label={
            isPostSearchActive ? 'searching posts…' : 'loading posts…'
          }
        >
          {[0, 1, 2].map((index) => (
            <PostRowSkeleton key={index} />
          ))}
        </CardSheet>
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
            className={cardSheetClass}
            items={visiblePostResults}
            getKey={(post) => String(post._id)}
          >
            {(post) => (
              <ExplorePostCard
                post={post}
                onDismiss={() => onDismissPost(post._id, String(post._id))}
              />
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
        <CardSheet
          role="status"
          aria-label={
            isProjectSearchActive ? 'searching projects…' : 'loading projects…'
          }
        >
          {[0, 1, 2].map((index) => (
            <ProjectCardSkeleton
              key={index}
              className="rounded-none border-0"
            />
          ))}
        </CardSheet>
      )}

      {!isBuildersMode && !isPostsMode && visibleItems.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-text-muted">
            {isProjectSearchActive ? 'matching projects' : 'projects'}
          </div>
          <InitialPageMotionList
            key={`projects:${entranceKey}`}
            className="flex flex-col gap-2"
            items={visibleItems}
            getKey={(item) => String(item.projectId)}
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
                  authorPlacement="header"
                  showFullCity
                  reactionSlot={
                    <ProjectReactionBar
                      projectId={projectId}
                      reactionCounts={item.reactionCounts}
                      viewerReactionTypes={item.viewerReactionTypes}
                      liked={liked}
                    />
                  }
                  className="focus-visible:ring-inset"
                  onDismiss={() => onDismissProject(projectId, projectKey)}
                  authorLink={{ username: item.authorHandle }}
                  onFollow={() => onFollowUser(ownerId, ownerKey, followed)}
                  onDM={
                    viewerId !== ownerId
                      ? () => onMessageUser(ownerId)
                      : undefined
                  }
                  projectLink={{ owner: item.owner, repo: item.repo }}
                  followPending={pendingFollows.has(ownerKey)}
                  dmPending={pendingUserId === ownerKey}
                />
              )
            }}
          </InitialPageMotionList>
          {hasMoreProjects && (
            <div className="mt-4 flex justify-center">
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
