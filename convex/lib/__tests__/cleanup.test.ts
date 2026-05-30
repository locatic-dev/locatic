import { describe, expect, it } from 'vitest'

import { deleteCleanupBatch, deleteMergedCleanupBatch } from '../cleanup'

describe('deleteCleanupBatch', () => {
  it('deletes one bounded batch and reports more work', async () => {
    const remaining = Array.from({ length: 205 }, (_, index) => index)

    const result = await deleteCleanupBatch({
      batchSize: 100,
      fetchBatch: async () => remaining.slice(0, 100),
      deleteBatch: async (batch) => {
        remaining.splice(0, batch.length)
      },
    })

    expect(result).toEqual({ deletedCount: 100, hasMore: true })
    expect(remaining).toHaveLength(105)
  })
})

describe('deleteMergedCleanupBatch', () => {
  it('deduplicates merged notification batches and caps unique deletes', async () => {
    const readNotifications = [
      { _id: 'shared_1' },
      { _id: 'shared_2' },
      ...Array.from({ length: 108 }, (_, index) => ({
        _id: `read_${index}`,
      })),
    ]
    const absoluteNotifications = [
      { _id: 'shared_1' },
      { _id: 'shared_2' },
      ...Array.from({ length: 108 }, (_, index) => ({
        _id: `absolute_${index}`,
      })),
    ]

    const result = await deleteMergedCleanupBatch({
      batchSize: 100,
      fetchBatches: async () => [
        readNotifications.slice(0, 100),
        absoluteNotifications.slice(0, 100),
      ],
      getKey: (item) => item._id,
      deleteBatch: async (batch) => {
        const deletedIds = new Set(batch.map((item) => item._id))
        for (const collection of [readNotifications, absoluteNotifications]) {
          for (let index = collection.length - 1; index >= 0; index -= 1) {
            if (deletedIds.has(collection[index]!._id)) {
              collection.splice(index, 1)
            }
          }
        }
      },
    })

    expect(result).toEqual({ deletedCount: 100, hasMore: true })
    expect(readNotifications.length + absoluteNotifications.length).toBe(118)
  })
})
