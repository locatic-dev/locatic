import { describe, expect, it } from 'vitest'

import type { Id } from '../../../../convex/_generated/dataModel'
import type { ExploreFeedState } from '@/features/explore/feed-state'
import { chunkSavedStateIds } from '@/features/explore/use-explore-saves'
import {
  FOLLOW_STATE_CHUNK_SIZE,
  getExploreFollowTargetIds,
} from '@/features/explore/use-explore-follow-state'

const id = (value: string) => value as Id<'users'>

function projectsState(ownerIds: string[]) {
  return {
    mode: 'projects',
    source: 'browse',
    scope: 'cities',
    status: 'ready',
    more: 'available',
    items: ownerIds.map((ownerId, index) => ({
      projectId: `project_${index}`,
      ownerUserId: id(ownerId),
    })),
  } as unknown as ExploreFeedState
}

describe('getExploreFollowTargetIds', () => {
  it('asks only about the users on screen, rail first, without the viewer', () => {
    const ids = getExploreFollowTargetIds({
      feedState: projectsState(['a', 'b', 'a', 'viewer', 'c']),
      railBuilders: [{ userId: id('r') }, { userId: id('b') }],
      viewerId: id('viewer'),
    })
    expect(ids).toEqual(['r', 'b', 'a', 'c'])
  })

  it('bounds each read by the visible results and keeps full chunks as pages load', () => {
    const firstPage = Array.from({ length: 30 }, (_, index) => `u${index}`)
    const twoPages = [
      ...firstPage,
      ...Array.from({ length: 30 }, (_, index) => `v${index}`),
    ]
    const first = chunkSavedStateIds(
      getExploreFollowTargetIds({
        feedState: projectsState(firstPage),
        railBuilders: [],
        viewerId: undefined,
      }),
      FOLLOW_STATE_CHUNK_SIZE,
    )
    expect(first).toEqual([firstPage])
    const second = chunkSavedStateIds(
      getExploreFollowTargetIds({
        feedState: projectsState(twoPages),
        railBuilders: [],
        viewerId: undefined,
      }),
      FOLLOW_STATE_CHUNK_SIZE,
    )
    expect(second.map((chunk) => chunk.length)).toEqual([40, 20])
    expect(second.flat()).toEqual(twoPages)
  })

  it('asks about nobody for post results or a loading feed', () => {
    expect(
      getExploreFollowTargetIds({
        feedState: {
          ...projectsState(['a']),
          mode: 'posts',
        } as unknown as ExploreFeedState,
        railBuilders: [],
        viewerId: undefined,
      }),
    ).toEqual([])
    expect(
      getExploreFollowTargetIds({
        feedState: {
          mode: 'projects',
          source: 'browse',
          scope: 'cities',
          status: 'loading',
        } as unknown as ExploreFeedState,
        railBuilders: [],
        viewerId: undefined,
      }),
    ).toEqual([])
  })
})
