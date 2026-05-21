export async function deleteCleanupBatches<T>(args: {
  batchSize: number
  fetchBatch: () => Promise<T[]>
  deleteBatch: (batch: T[]) => Promise<void>
}) {
  let deletedCount = 0

  while (true) {
    const batch = await args.fetchBatch()
    if (batch.length === 0) {
      return deletedCount
    }

    await args.deleteBatch(batch)
    deletedCount += batch.length

    if (batch.length < args.batchSize) {
      return deletedCount
    }
  }
}

export async function deleteMergedCleanupBatches<T>(args: {
  batchSize: number
  fetchBatches: () => Promise<T[][]>
  getKey: (item: T) => string
  deleteBatch: (batch: T[]) => Promise<void>
}) {
  let deletedCount = 0

  while (true) {
    const mergedBatch = new Map<string, T>()

    for (const batch of await args.fetchBatches()) {
      for (const item of batch) {
        mergedBatch.set(args.getKey(item), item)
      }
    }

    const items = [...mergedBatch.values()]
    if (items.length === 0) {
      return deletedCount
    }

    await args.deleteBatch(items)
    deletedCount += items.length

    if (items.length < args.batchSize) {
      return deletedCount
    }
  }
}
