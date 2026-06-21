import { describe, expect, it } from 'vitest'
import {
  DEEP_LINK_LOAD_MORE_ATTEMPT_LIMIT,
  getCommentExpansionPath,
  getProjectDeepLinkTab,
  parseCommentPathSearch,
  shouldAutoLoadDeepLinkPage,
} from '../deep-link'

describe('project deep links', () => {
  it('parses compact comment path search params', () => {
    expect(parseCommentPathSearch('root, parent ,, child ')).toEqual([
      'root',
      'parent',
      'child',
    ])
    expect(parseCommentPathSearch(undefined)).toEqual([])
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
        commentId: 'comment_1',
        postId: null,
        postsCount: 3,
      }),
    ).toBe('discussion')
    expect(
      getProjectDeepLinkTab({
        commentId: null,
        postId: null,
        postsCount: 3,
      }),
    ).toBe('posts')
    expect(
      getProjectDeepLinkTab({
        commentId: null,
        postId: null,
        postsCount: 0,
      }),
    ).toBe('readme')
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
