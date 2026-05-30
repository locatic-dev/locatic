export type CleanupBatchResult = {
  deletedCount: number
  hasMore: boolean
}

export async function deleteCleanupBatch<T>(args: {
  batchSize: number
  fetchBatch: () => Promise<T[]>
  deleteBatch: (batch: T[]) => Promise<void>
}): Promise<CleanupBatchResult> {
  const batch = (await args.fetchBatch()).slice(0, args.batchSize)
  if (batch.length === 0) {
    return { deletedCount: 0, hasMore: false }
  }

  await args.deleteBatch(batch)

  return {
    deletedCount: batch.length,
    hasMore: batch.length >= args.batchSize,
  }
}

export async function deleteMergedCleanupBatch<T>(args: {
  batchSize: number
  fetchBatches: () => Promise<T[][]>
  getKey: (item: T) => string
  deleteBatch: (batch: T[]) => Promise<void>
}): Promise<CleanupBatchResult> {
  const mergedBatch = new Map<string, T>()

  for (const batch of await args.fetchBatches()) {
    for (const item of batch) {
      mergedBatch.set(args.getKey(item), item)
    }
  }

  const items = [...mergedBatch.values()].slice(0, args.batchSize)
  if (items.length === 0) {
    return { deletedCount: 0, hasMore: false }
  }

  await args.deleteBatch(items)

  return {
    deletedCount: items.length,
    hasMore: items.length >= args.batchSize,
  }
}
