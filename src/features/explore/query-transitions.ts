import type { Query } from '@tanstack/react-query'
import type { Id } from '../../../convex/_generated/dataModel'
import { areExploreCityIdsEqual } from './state'

type PostSearchQueryArgs = {
  cityIds?: Array<Id<'cities'>>
  limit?: number
  q?: string
}

type QueryWithArgs = Pick<
  Query<unknown, Error, unknown, readonly unknown[]>,
  'queryKey'
>

function getQueryArgs<TArgs>(query: QueryWithArgs | undefined): TArgs | null {
  const args = query?.queryKey[2]
  return args && typeof args === 'object' ? (args as TArgs) : null
}

export function keepPreviousPostSearchData<TData>({
  currentCityIds,
  currentQuery,
}: {
  currentCityIds: Array<Id<'cities'>>
  currentQuery: string
}) {
  return (
    previousData: TData | undefined,
    previousQuery: QueryWithArgs | undefined,
  ) => {
    const previousArgs = getQueryArgs<PostSearchQueryArgs>(previousQuery)
    if (
      !previousArgs ||
      previousArgs.q !== currentQuery ||
      !areExploreCityIdsEqual(
        (previousArgs.cityIds ?? []).map(String),
        currentCityIds.map(String),
      )
    ) {
      return undefined
    }

    return previousData
  }
}
