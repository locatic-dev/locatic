import type { Query } from '@tanstack/react-query'
import type { Id } from '../../../convex/_generated/dataModel'
import { areExploreCityIdsEqual, type ExploreScope } from './state'

type ExploreFeedQueryArgs = {
  limit?: number
  scope?: ExploreScope
  selectedCityIds?: Array<Id<'cities'>>
}

type PostSearchQueryArgs = {
  cityIds?: Array<Id<'cities'>>
  limit?: number
  q?: string
}

type PostListQueryArgs = {
  limit?: number
  scope?: ExploreScope
  selectedCityIds?: Array<Id<'cities'>>
}

type QueryWithArgs = Pick<
  Query<unknown, Error, unknown, readonly unknown[]>,
  'queryKey'
>

function getQueryArgs<TArgs>(query: QueryWithArgs | undefined): TArgs | null {
  const args = query?.queryKey[2]
  return args && typeof args === 'object' ? (args as TArgs) : null
}

export function keepPreviousExploreFeedData<TData>({
  currentScope,
  currentSelectedCityIds,
}: {
  currentScope: ExploreScope
  currentSelectedCityIds: Array<Id<'cities'>>
}) {
  return (
    previousData: TData | undefined,
    previousQuery: QueryWithArgs | undefined,
  ) => {
    const previousArgs = getQueryArgs<ExploreFeedQueryArgs>(previousQuery)
    if (
      !previousArgs ||
      previousArgs.scope !== currentScope ||
      !areExploreCityIdsEqual(
        (previousArgs.selectedCityIds ?? []).map(String),
        currentSelectedCityIds.map(String),
      )
    ) {
      return undefined
    }

    return previousData
  }
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

export function keepPreviousPostListData<TData>({
  currentScope,
  currentSelectedCityIds,
}: {
  currentScope: ExploreScope
  currentSelectedCityIds: Array<Id<'cities'>>
}) {
  return (
    previousData: TData | undefined,
    previousQuery: QueryWithArgs | undefined,
  ) => {
    const previousArgs = getQueryArgs<PostListQueryArgs>(previousQuery)
    if (
      !previousArgs ||
      previousArgs.scope !== currentScope ||
      !areExploreCityIdsEqual(
        (previousArgs.selectedCityIds ?? []).map(String),
        currentSelectedCityIds.map(String),
      )
    ) {
      return undefined
    }

    return previousData
  }
}
