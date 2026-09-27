import { describe, expect, it } from 'vitest'

import {
  getProfileContentTabs,
  isProfileContributionsPublic,
  mergeSocialItems,
  normalizeProfileSearch,
  PROFILE_CONTENT_TAB_VALUES,
  summarizeProfileLanguages,
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

  it('keeps contribution tabs in the primary tab list regardless of privacy', () => {
    const tabs = [
      { count: 3, id: 'projects', label: 'projects' },
      { count: 2, id: 'contributions', label: 'contributions' },
      { count: 1, id: 'comments', label: 'comments' },
    ]

    expect(getProfileContentTabs(tabs)).toEqual(tabs)
    expect(normalizeProfileSearch({ tab: 'contributions' })).toEqual({
      network: 'followers',
      tab: 'contributions',
    })
  })

  it('sums language bytes once per project, largest first, capped', () => {
    const typescript = { name: 'TypeScript', bytes: 100 }
    const projects = [
      { projectId: 'a', languages: [typescript, { name: 'Go', bytes: 50 }] },
      // The same project listed twice (pinned and recent) counts once.
      { projectId: 'a', languages: [typescript] },
      { projectId: 'b', languages: [{ name: 'Rust', bytes: 120 }, typescript] },
      { projectId: 'c', languages: [{ name: '', bytes: 999 }] },
    ]

    expect(summarizeProfileLanguages(projects)).toEqual([
      { name: 'TypeScript', bytes: 200 },
      { name: 'Rust', bytes: 120 },
      { name: 'Go', bytes: 50 },
    ])
    expect(summarizeProfileLanguages(projects, 1)).toEqual([
      { name: 'TypeScript', bytes: 200 },
    ])
  })

  it('merges follow-graph pages without duplicating users', () => {
    expect(
      mergeSocialItems(
        [
          { userId: 'u1', name: 'old' },
          { userId: 'u2', name: 'two' },
        ],
        [
          { userId: 'u1', name: 'new' },
          { userId: 'u3', name: 'three' },
        ],
      ),
    ).toEqual([
      { userId: 'u1', name: 'new' },
      { userId: 'u2', name: 'two' },
      { userId: 'u3', name: 'three' },
    ])
  })
})
