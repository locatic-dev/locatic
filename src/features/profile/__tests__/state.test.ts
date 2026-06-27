import { describe, expect, it } from 'vitest'

import {
  getVisibleProfileContentTab,
  getVisibleProfileContentTabs,
  getProfileContentTabs,
  isProfileContributionsPublic,
  normalizeProfileSearch,
  PROFILE_CONTENT_TAB_VALUES,
} from '../state'

describe('profile state helpers', () => {
  it('exposes the supported primary content tabs', () => {
    expect(PROFILE_CONTENT_TAB_VALUES).toEqual([
      'projects',
      'posts',
      'contributions',
      'comments',
      'liked',
    ])
  })

  it('normalizes empty search to the default projects tab and followers network view', () => {
    expect(normalizeProfileSearch({})).toEqual({
      network: 'followers',
      tab: 'projects',
    })
  })

  it('keeps valid content tabs and network selections', () => {
    expect(
      normalizeProfileSearch({
        tab: 'posts',
        network: 'following',
      }),
    ).toEqual({
      network: 'following',
      tab: 'posts',
    })
  })

  it('maps legacy follow-graph tabs into the network section', () => {
    expect(
      normalizeProfileSearch({
        tab: 'followers',
      }),
    ).toEqual({
      network: 'followers',
      tab: 'projects',
    })

    expect(
      normalizeProfileSearch({
        tab: 'following',
      }),
    ).toEqual({
      network: 'following',
      tab: 'projects',
    })
  })

  it('omits network-only tabs from the primary tab list', () => {
    expect(
      getProfileContentTabs([
        { count: 3, id: 'projects', label: 'projects' },
        { count: 1, id: 'followers', label: 'followers' },
        { count: 2, id: 'comments', label: 'comments' },
        { count: 1, id: 'following', label: 'following' },
      ]),
    ).toEqual([
      { count: 3, id: 'projects', label: 'projects' },
      { count: 2, id: 'comments', label: 'comments' },
    ])
  })

  it('treats missing contribution visibility as public', () => {
    expect(isProfileContributionsPublic({})).toBe(true)
    expect(
      isProfileContributionsPublic({ contributionsVisibility: 'public' }),
    ).toBe(true)
    expect(
      isProfileContributionsPublic({ contributionsVisibility: 'private' }),
    ).toBe(false)
  })

  it('hides the contribution tab and falls back to projects when contributions are private', () => {
    const tabs = [
      { count: 3, id: 'projects', label: 'projects' },
      { count: 2, id: 'contributions', label: 'contributions' },
      { count: 1, id: 'comments', label: 'comments' },
    ]

    expect(
      getVisibleProfileContentTabs(tabs, { showContributions: false }),
    ).toEqual([
      { count: 3, id: 'projects', label: 'projects' },
      { count: 1, id: 'comments', label: 'comments' },
    ])
    expect(
      getVisibleProfileContentTabs(tabs, { showContributions: true }),
    ).toEqual(tabs)
    expect(
      getVisibleProfileContentTab('contributions', {
        showContributions: false,
      }),
    ).toBe('projects')
  })
})
