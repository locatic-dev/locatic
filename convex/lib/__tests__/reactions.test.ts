import { describe, expect, it, vi } from 'vitest'

import type { Id } from '../../_generated/dataModel'
import {
  getCommentReactionCounts,
  getViewerReactionTypesByTargetId,
} from '../reactions'

describe('reaction helpers', () => {
  it('preserves legacy comment likes when reactionCounts is missing', () => {
    expect(
      getCommentReactionCounts({
        likesCount: 3,
        reactionCounts: undefined,
      }),
    ).toEqual({ like: 3 })
  })

  it('prefers stored comment reactionCounts when present', () => {
    expect(
      getCommentReactionCounts({
        likesCount: 3,
        reactionCounts: { flame: 2, like: 1 },
      }),
    ).toEqual({ flame: 2, like: 1 })
  })

  it('maps viewer reaction types by target id and dedupes duplicate targets', async () => {
    const collectByTargetId: Record<string, Array<{ reactionType: string }>> = {
      post_1: [{ reactionType: 'like' }, { reactionType: 'rocket' }],
      post_2: [{ reactionType: 'flame' }],
    }
    const query = vi.fn(() => ({
      withIndex: vi.fn((_indexName, callback) => {
        const eq = vi.fn()
        const builder = {
          eq: (field: string, value: unknown) => {
            eq(field, value)
            return builder
          },
        }
        callback(builder)
        const targetId = eq.mock.calls.find(
          ([field]) => field === 'targetId',
        )?.[1] as string

        return {
          collect: vi.fn(async () => collectByTargetId[targetId] ?? []),
        }
      }),
    }))
    const ctx = {
      db: { query },
    } as unknown as Parameters<typeof getViewerReactionTypesByTargetId>[0]

    const result = await getViewerReactionTypesByTargetId(
      ctx,
      {
        _id: 'user_1' as Id<'users'>,
      } as Parameters<typeof getViewerReactionTypesByTargetId>[1],
      {
        targetIds: ['post_1', 'post_1', 'post_2'],
        targetType: 'post',
      },
    )

    expect(query).toHaveBeenCalledTimes(2)
    expect(result.get('post_1')).toEqual(['like', 'rocket'])
    expect(result.get('post_2')).toEqual(['flame'])
  })
})
