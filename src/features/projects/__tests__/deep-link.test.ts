import { describe, expect, it } from 'vitest'
import {
  DEEP_LINK_LOAD_MORE_ATTEMPT_LIMIT,
  getActiveHighlightedCommentId,
  getCommentExpansionPath,
  getProjectDeepLinkTab,
  normalizeProjectSearchParam,
  parseCommentPathSearch,
  PROJECT_TAB_ORDER,
  shouldAutoLoadDeepLinkPage,
  shouldResetReleasedHighlight,
  shouldSyncProjectTab,
  stripProjectCommentSearch,
} from '../deep-link'

describe('project deep links', () => {
  it('uses the comments, posts, releases workspace order', () => {
    expect(PROJECT_TAB_ORDER).toEqual(['comments', 'posts', 'releases'])
  })
  it('parses compact comment path search params', () => {
    expect(parseCommentPathSearch('root, parent ,, child ')).toEqual([
      'root',
      'parent',
      'child',
    ])
    expect(parseCommentPathSearch(undefined)).toEqual([])
  })

  it('normalizes empty and stringified-null project search params away', () => {
    expect(normalizeProjectSearchParam('comment_1')).toBe('comment_1')
    expect(normalizeProjectSearchParam(' comment_1 ')).toBe('comment_1')
    expect(normalizeProjectSearchParam('')).toBeNull()
    expect(normalizeProjectSearchParam('null')).toBeNull()
    expect(normalizeProjectSearchParam('undefined')).toBeNull()
    expect(normalizeProjectSearchParam(null)).toBeNull()
  })

  it('strips comment-only deep-link params without removing post context', () => {
    expect(
      stripProjectCommentSearch({
        comment: 'comment_1',
        commentPath: 'root,comment_1',
        post: 'post_1',
        tab: 'readme',
        thread: 'root',
      }),
    ).toEqual({ post: 'post_1', tab: 'readme' })
  })

  it('syncs tabs initially and for active deep links only', () => {
    expect(
      shouldSyncProjectTab({
        hasActiveDeepLinkTarget: false,
        hasSyncedInitialTab: false,
      }),
    ).toBe(true)
    expect(
      shouldSyncProjectTab({
        hasActiveDeepLinkTarget: true,
        hasSyncedInitialTab: true,
      }),
    ).toBe(true)
    expect(
      shouldSyncProjectTab({
        hasActiveDeepLinkTarget: false,
        hasSyncedInitialTab: true,
      }),
    ).toBe(false)
  })

  it('selects the tab needed by route search', () => {
    expect(
      getProjectDeepLinkTab({
        commentId: 'comment_1',
        postId: 'post_1',
        postsCount: 0,
      }),
    ).toBe('posts')
    expect(
      getProjectDeepLinkTab({
        commentId: null,
        postId: null,
        releaseId: 'release_1',
        postsCount: 0,
      }),
    ).toBe('releases')
    expect(
      getProjectDeepLinkTab({
        commentId: 'comment_1',
        postId: null,
        postsCount: 3,
      }),
    ).toBe('comments')
    expect(
      getProjectDeepLinkTab({
        commentId: null,
        postId: null,
        postsCount: 3,
      }),
    ).toBe('comments')
    expect(
      getProjectDeepLinkTab({
        commentId: null,
        postId: null,
        postsCount: 0,
      }),
    ).toBe('comments')
  })

  it('prefers explicit ancestor paths over thread fallback', () => {
    expect(
      getCommentExpansionPath({
        commentPath: ['root', 'parent'],
        threadId: 'root',
      }),
    ).toEqual(['root', 'parent'])
    expect(
      getCommentExpansionPath({
        commentPath: [],
        threadId: 'root',
      }),
    ).toEqual(['root'])
  })

  it('releases a highlighted comment until the route target clears', () => {
    expect(
      getActiveHighlightedCommentId({
        rawHighlightedCommentId: 'comment_1',
        releasedHighlightId: null,
      }),
    ).toBe('comment_1')
    expect(
      getActiveHighlightedCommentId({
        rawHighlightedCommentId: 'comment_1',
        releasedHighlightId: 'comment_1',
      }),
    ).toBeNull()
    expect(
      shouldResetReleasedHighlight({
        rawHighlightedCommentId: null,
        releasedHighlightId: 'comment_1',
      }),
    ).toBe(true)
    expect(
      getActiveHighlightedCommentId({
        rawHighlightedCommentId: 'comment_1',
        releasedHighlightId: null,
      }),
    ).toBe('comment_1')
  })

  it('bounds automatic deep-link pagination', () => {
    expect(
      shouldAutoLoadDeepLinkPage({
        attempts: 0,
        isLoaded: false,
        status: 'CanLoadMore',
        targetId: 'target_1',
      }),
    ).toBe(true)
    expect(
      shouldAutoLoadDeepLinkPage({
        attempts: DEEP_LINK_LOAD_MORE_ATTEMPT_LIMIT,
        isLoaded: false,
        status: 'CanLoadMore',
        targetId: 'target_1',
      }),
    ).toBe(false)
    expect(
      shouldAutoLoadDeepLinkPage({
        attempts: 0,
        isLoaded: true,
        status: 'CanLoadMore',
        targetId: 'target_1',
      }),
    ).toBe(false)
    expect(
      shouldAutoLoadDeepLinkPage({
        attempts: 0,
        isLoaded: false,
        status: 'LoadingMore',
        targetId: 'target_1',
      }),
    ).toBe(false)
  })
})
