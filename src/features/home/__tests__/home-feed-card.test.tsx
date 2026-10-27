import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { Id } from '../../../../convex/_generated/dataModel'
import {
  getHomeFeedActorLocation,
  getHomeFeedPreviewState,
  getHomeFeedTargetRoute,
  hasRenderableHomeFeedTarget,
  HomeFeedCard,
} from '../home-feed-card'
import type { HomeFeedCommentTarget, HomeFeedItem } from '../cache'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    className,
    params = {},
    to,
  }: {
    children: ReactNode
    className?: string
    params?: Record<string, string>
    to: string
  }) => (
    <a
      className={className}
      href={to.replace(/\$(\w+)/g, (_match, key: string) => params[key] ?? '')}
    >
      {children}
    </a>
  ),
}))

const actorSnapshot = {
  avatarUrl: '',
  cityId: null,
  cityName: null,
  displayName: 'Avi',
}

const projectSnapshot = {
  cityId: null,
  cityName: null,
  commentsCount: 0,
  description: 'Tiny test project',
  fullName: 'avi/test',
  languages: [],
  likesCount: 0,
  name: 'test',
  ownerAvatarUrl: '',
  ownerDisplayName: 'Avi',
  ownerId: 'user_owner' as Id<'users'>,
  ownerLogin: 'avi',
  primaryLanguage: 'TypeScript',
  stargazersCount: 0,
}

function projectTarget(index: number) {
  return {
    kind: 'project' as const,
    projectId: `project_${index}` as Id<'projects'>,
    projectSnapshot: {
      ...projectSnapshot,
      fullName: `avi/test-${index}`,
      name: `test-${index}`,
    },
  }
}

function feedItem(overrides: Partial<HomeFeedItem>): HomeFeedItem {
  return {
    _creationTime: 0,
    _id: 'feed_1' as Id<'home_feed_items'>,
    actorId: 'user_actor' as Id<'users'>,
    actorSnapshot,
    createdAt: Date.parse('2026-06-21T10:00:00.000Z'),
    dedupeKey: 'group',
    eventType: 'project_liked',
    priority: 1,
    project: null,
    projectId: null,
    projectPreview: null,
    projectSnapshot: null,
    reason: 'following',
    sourceEventId: 'event_1' as Id<'activity_events'>,
    userId: 'user_viewer' as Id<'users'>,
    ...overrides,
  }
}

describe('HomeFeedCard helpers', () => {
  it('builds reply comment routes with root thread and ancestor path', () => {
    const target: HomeFeedCommentTarget = {
      ancestorCommentIds: [
        'comment_root' as Id<'comments'>,
        'comment_parent' as Id<'comments'>,
      ],
      commentId: 'comment_child' as Id<'comments'>,
      content: 'Looks good',
      kind: 'comment',
      postId: 'post_1' as Id<'posts'>,
      projectId: 'project_1' as Id<'projects'>,
      projectSnapshot,
      rootCommentId: 'comment_root' as Id<'comments'>,
      targetLabel: 'test',
      targetType: 'post',
    }

    expect(getHomeFeedTargetRoute(target)).toMatchObject({
      hash: 'comment-comment_child',
      search: {
        comment: 'comment_child',
        commentPath: 'comment_root,comment_parent',
        post: 'post_1',
        thread: 'comment_root',
      },
    })
  })

  it('caps collapsed and expanded previews without leaving an enabled expansion after cap', () => {
    const item = feedItem({
      eventCount: 15,
      previewTargets: Array.from({ length: 10 }, (_, index) =>
        projectTarget(index),
      ),
    })

    const collapsed = getHomeFeedPreviewState(item, false)
    expect(collapsed.visibleTargets).toHaveLength(3)
    expect(collapsed.remainingCount).toBe(12)
    expect(collapsed.hasStoredTargetsToExpand).toBe(true)

    const expanded = getHomeFeedPreviewState(item, true)
    expect(expanded.visibleTargets).toHaveLength(10)
    expect(expanded.remainingCount).toBe(5)
    expect(expanded.hasStoredTargetsToExpand).toBe(false)
  })

  it('never renders the non-interactive "Showing X of Y" dead-end footer', () => {
    // 4 events but only 3 stored targets: nothing more to expand and not a
    // comment group, so the footer must not render at all.
    const item = feedItem({
      eventType: 'project_posted',
      eventCount: 4,
      previewTargets: [0, 1, 2].map((index) => ({
        ...projectTarget(index),
        isOpenable: false,
      })),
    })

    const html = renderToStaticMarkup(
      <HomeFeedCard
        item={item}
        likedProjectIds={new Set()}
        pendingLikes={new Set()}
        onLikeProject={() => undefined}
      />,
    )

    expect(html).not.toContain('Showing')
    expect(html).not.toContain('more')
  })

  it('renders an interactive "+N more" when stored targets can expand', () => {
    const item = feedItem({
      eventType: 'project_posted',
      eventCount: 15,
      previewTargets: Array.from({ length: 10 }, (_, index) => ({
        ...projectTarget(index),
        isOpenable: false,
      })),
    })

    const html = renderToStaticMarkup(
      <HomeFeedCard
        item={item}
        likedProjectIds={new Set()}
        pendingLikes={new Set()}
        onLikeProject={() => undefined}
      />,
    )

    expect(html).toContain('+12 more')
    expect(html).not.toContain('Showing')
  })

  it('does not render a like button for non-openable project targets', () => {
    const item = feedItem({
      eventType: 'project_liked',
      previewTargets: [
        {
          ...projectTarget(1),
          isOpenable: false,
        },
      ],
      projectId: 'project_1' as Id<'projects'>,
      projectSnapshot,
    })

    const html = renderToStaticMarkup(
      <HomeFeedCard
        item={item}
        likedProjectIds={new Set()}
        pendingLikes={new Set()}
        onLikeProject={() => undefined}
      />,
    )

    expect(html).not.toContain('Like avi/test-1')
  })

  it('renders one primary language chip for project targets', () => {
    const item = feedItem({
      eventType: 'project_posted',
      previewTargets: [
        {
          ...projectTarget(1),
          isOpenable: false,
          projectSnapshot: {
            ...projectSnapshot,
            fullName: 'avi/test-1',
            languages: [
              { name: 'TypeScript', bytes: 800 },
              { name: 'CSS', bytes: 200 },
            ],
            name: 'test-1',
            primaryLanguage: 'TypeScript',
          },
        },
      ],
    })

    const html = renderToStaticMarkup(
      <HomeFeedCard
        item={item}
        likedProjectIds={new Set()}
        pendingLikes={new Set()}
        onLikeProject={() => undefined}
      />,
    )

    expect(html).toContain('TypeScript')
    expect(html).not.toContain('CSS')
  })

  it('does not render the retired stacked-card wrapper for grouped cards', () => {
    const singleton = feedItem({
      eventCount: 1,
      previewTargets: [{ ...projectTarget(1), isOpenable: false }],
    })
    const grouped = feedItem({
      eventCount: 2,
      previewTargets: [
        { ...projectTarget(1), isOpenable: false },
        { ...projectTarget(2), isOpenable: false },
      ],
    })

    const singletonHtml = renderToStaticMarkup(
      <HomeFeedCard
        item={singleton}
        likedProjectIds={new Set()}
        pendingLikes={new Set()}
        onLikeProject={() => undefined}
      />,
    )
    const groupedHtml = renderToStaticMarkup(
      <HomeFeedCard
        item={grouped}
        likedProjectIds={new Set()}
        pendingLikes={new Set()}
        onLikeProject={() => undefined}
      />,
    )

    expect(singletonHtml).not.toContain('lx-card-stack')
    expect(groupedHtml).not.toContain('lx-card-stack')
  })

  it('renders a delivered follow-feed row as returned by home.list', () => {
    // Last step of the Home activity trace (convex/home.test.ts covers source, delivery,
    // retention and the read).
    const item = feedItem({
      eventType: 'project_posted',
      eventCount: 1,
      target: { ...projectTarget(1), isOpenable: true },
      previewTargets: [{ ...projectTarget(1), isOpenable: true }],
    })

    expect(hasRenderableHomeFeedTarget(item)).toBe(true)
    const html = renderToStaticMarkup(
      <HomeFeedCard
        item={item}
        likedProjectIds={new Set()}
        pendingLikes={new Set()}
        onLikeProject={() => undefined}
      />,
    )

    expect(html).toContain('Avi published a project')
    expect(html).toContain('test-1')
    expect(html).toContain('href="/project/avi/test-1"')
  })

  it('links the actor to their profile and their exact city to Explore', () => {
    const item = feedItem({
      actorGithubUsername: 'avi',
      actorSnapshot: {
        ...actorSnapshot,
        cityId: 'city_blr' as Id<'cities'>,
        cityName: 'Bengaluru, Karnataka, India',
      },
      eventType: 'project_posted',
      eventCount: 1,
      target: { ...projectTarget(1), isOpenable: true },
      previewTargets: [{ ...projectTarget(1), isOpenable: true }],
    })

    const html = renderToStaticMarkup(
      <HomeFeedCard
        item={item}
        likedProjectIds={new Set()}
        pendingLikes={new Set()}
        onLikeProject={() => undefined}
      />,
    )

    expect(html).toContain('href="/u/avi"')
    expect(html).toContain('href="/c/city_blr"')
    expect(html).toContain('Bengaluru, Karnataka, India')
  })

  it('shows the actor without a profile link when the login is unknown', () => {
    const html = renderToStaticMarkup(
      <HomeFeedCard
        item={feedItem({
          eventType: 'project_posted',
          eventCount: 1,
          target: { ...projectTarget(1), isOpenable: true },
          previewTargets: [{ ...projectTarget(1), isOpenable: true }],
        })}
        likedProjectIds={new Set()}
        pendingLikes={new Set()}
        onLikeProject={() => undefined}
      />,
    )

    expect(html).not.toContain('href="/u/')
    expect(html).not.toContain('href="/c/')
  })

  it('reads the actor location from the snapshot encoding', () => {
    expect(
      getHomeFeedActorLocation({
        ...actorSnapshot,
        cityId: 'city_blr' as Id<'cities'>,
        cityName: 'Bengaluru, Karnataka, India',
      }),
    ).toEqual({
      kind: 'city',
      cityId: 'city_blr',
      cityName: 'Bengaluru, Karnataka, India',
    })
    expect(
      getHomeFeedActorLocation({
        ...actorSnapshot,
        cityId: null,
        cityName: 'Karnataka, India',
      }),
    ).toEqual({ kind: 'region', regionLabel: 'Karnataka, India' })
    expect(getHomeFeedActorLocation(actorSnapshot)).toEqual({ kind: 'none' })
  })

  it('renders nothing for a row with no target to show', () => {
    const item = feedItem({
      eventType: 'project_posted',
      target: null,
      previewTargets: [],
    })

    expect(hasRenderableHomeFeedTarget(item)).toBe(false)
    expect(
      renderToStaticMarkup(
        <HomeFeedCard
          item={item}
          likedProjectIds={new Set()}
          pendingLikes={new Set()}
          onLikeProject={() => undefined}
        />,
      ),
    ).toBe('')
  })
})
