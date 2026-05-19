import { describe, expect, it } from 'vitest'

import { getHomeCardDmTargetUserId } from '../project-card-targets'

describe('getHomeCardDmTargetUserId', () => {
  it('targets the visible project owner instead of the feed actor', () => {
    expect(
      getHomeCardDmTargetUserId({
        actorUserId: 'commenter_1',
        ownerUserId: 'owner_1',
        viewerUserId: 'viewer_1',
      }),
    ).toBe('owner_1')
  })

  it('returns null when the viewer is already the project owner', () => {
    expect(
      getHomeCardDmTargetUserId({
        actorUserId: 'commenter_1',
        ownerUserId: 'owner_1',
        viewerUserId: 'owner_1',
      }),
    ).toBeNull()
  })
})
