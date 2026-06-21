import { describe, expect, it } from 'vitest'

import {
  getNextUserPostsCountBackfillCursor,
  shouldPatchUserPostsCount,
} from '../post_counts'

describe('shouldPatchUserPostsCount', () => {
  it('treats missing counts as zero during rollout', () => {
    expect(shouldPatchUserPostsCount(undefined, 0)).toBe(false)
    expect(shouldPatchUserPostsCount(null, 0)).toBe(false)
    expect(shouldPatchUserPostsCount(undefined, 2)).toBe(true)
  })

  it('patches only when the stored count differs', () => {
    expect(shouldPatchUserPostsCount(3, 3)).toBe(false)
    expect(shouldPatchUserPostsCount(3, 2)).toBe(true)
  })
})

describe('getNextUserPostsCountBackfillCursor', () => {
  it('continues from the last scanned createdAt when the batch is full', () => {
    expect(
      getNextUserPostsCountBackfillCursor(
        [{ createdAt: 1_000 }, { createdAt: 2_000 }],
        2,
      ),
    ).toBe(2_000)
  })

  it('stops when the batch is not full', () => {
    expect(
      getNextUserPostsCountBackfillCursor([{ createdAt: 1_000 }], 2),
    ).toBeNull()
  })
})
