import { useQueries } from '@tanstack/react-query'
import type { Id } from '../../../convex/_generated/dataModel'
import { savedStateQueryOptions } from '@/features/projects/saves'

/** Most ids `api.projects.getSavedState` accepts per call. */
export const SAVED_STATE_CHUNK_SIZE = 40

/**
 * Splits loaded card ids into chunks of at most 40, filled in load order, so
 * a full chunk keeps its ids (and its cached query) as more pages load.
 */
export function chunkSavedStateIds<TId>(
  projectIds: TId[],
  size = SAVED_STATE_CHUNK_SIZE,
): TId[][] {
  const unique = [...new Set(projectIds)]
  const chunks: TId[][] = []
  for (let index = 0; index < unique.length; index += size) {
    chunks.push(unique.slice(index, index + size))
  }
  return chunks
}

/**
 * The saved project ids among the loaded Explore cards, for a signed-in
 * viewer; always empty for visitors, who get no queries at all (a disabled
 * Convex query would still subscribe).
 */
export function useExploreSavedProjectIds(
  projectIds: Array<Id<'projects'>>,
  enabled: boolean,
): Set<string> {
  const results = useQueries({
    queries: chunkSavedStateIds(enabled ? projectIds : []).map((ids) =>
      savedStateQueryOptions(ids),
    ),
  })

  return new Set(
    results.flatMap((result) =>
      ((result.data as Array<Id<'projects'>> | undefined) ?? []).map(String),
    ),
  )
}
