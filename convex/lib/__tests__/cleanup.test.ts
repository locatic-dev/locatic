import { describe, expect, it } from 'vitest'

import { deleteCleanupBatches, deleteMergedCleanupBatches } from '../cleanup'

describe('deleteCleanupBatches', () => {
  it('drains more than one batch of expired rows', async () => {
    const remaining = Array.from({ length: 205 }, (_, index) => index)

    const deletedCount = await deleteCleanupBatches({
      batchSize: 100,
      fetchBatch: async () => remaining.slice(0, 100),
      deleteBatch: async (batch) => {
        remaining.splice(0, batch.length)
      },
    })

    expect(deletedCount).toBe(205)
    expect(remaining).toHaveLength(0)
  })
})

describe('deleteMergedCleanupBatches', () => {
  it('deduplicates merged notification batches while draining multiple passes', async () => {
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

    const deletedCount = await deleteMergedCleanupBatches({
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

    expect(deletedCount).toBe(218)
    expect(readNotifications).toHaveLength(0)
    expect(absoluteNotifications).toHaveLength(0)
  })
})
