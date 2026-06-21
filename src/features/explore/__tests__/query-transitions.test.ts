import { describe, expect, it } from 'vitest'
import type { Id } from '../../../../convex/_generated/dataModel'
import {
  keepPreviousExploreFeedData,
  keepPreviousPostSearchData,
} from '../query-transitions'

function makePreviousQuery(args: unknown) {
  return {
    queryKey: ['convexQuery', 'explore', args],
  }
}

describe('keepPreviousExploreFeedData', () => {
  const previousData = { projects: ['project_1'] }
  const selectedCityIds = ['city_1' as Id<'cities'>]

  it('keeps project feed data when only the limit changes', () => {
    const placeholderData = keepPreviousExploreFeedData<typeof previousData>({
      currentScope: 'custom',
      currentSelectedCityIds: selectedCityIds,
    })

    expect(
      placeholderData(
        previousData,
        makePreviousQuery({
          limit: 20,
          scope: 'custom',
          selectedCityIds,
        }),
      ),
    ).toBe(previousData)
  })

  it('drops project feed data when scope changes', () => {
    const placeholderData = keepPreviousExploreFeedData<typeof previousData>({
      currentScope: 'global',
      currentSelectedCityIds: [],
    })

    expect(
      placeholderData(
        previousData,
        makePreviousQuery({
          limit: 20,
          scope: 'custom',
          selectedCityIds,
        }),
      ),
    ).toBeUndefined()
  })

  it('drops project feed data when selected cities change', () => {
    const placeholderData = keepPreviousExploreFeedData<typeof previousData>({
      currentScope: 'custom',
      currentSelectedCityIds: ['city_2' as Id<'cities'>],
    })

    expect(
      placeholderData(
        previousData,
        makePreviousQuery({
          limit: 20,
          scope: 'custom',
          selectedCityIds,
        }),
      ),
    ).toBeUndefined()
  })
})

describe('keepPreviousPostSearchData', () => {
  const previousData = { hasMore: true, posts: ['post_1'] }
  const cityIds = ['city_1' as Id<'cities'>]

  it('keeps post search data when only the limit changes', () => {
    const placeholderData = keepPreviousPostSearchData<typeof previousData>({
      currentCityIds: cityIds,
      currentQuery: 'react',
    })

    expect(
      placeholderData(
        previousData,
        makePreviousQuery({
          cityIds,
          limit: 20,
          q: 'react',
        }),
      ),
    ).toBe(previousData)
  })

  it('drops post search data when the query changes', () => {
    const placeholderData = keepPreviousPostSearchData<typeof previousData>({
      currentCityIds: cityIds,
      currentQuery: 'convex',
    })

    expect(
      placeholderData(
        previousData,
        makePreviousQuery({
          cityIds,
          limit: 20,
          q: 'react',
        }),
      ),
    ).toBeUndefined()
  })

  it('drops post search data when city filters change', () => {
    const placeholderData = keepPreviousPostSearchData<typeof previousData>({
      currentCityIds: ['city_2' as Id<'cities'>],
      currentQuery: 'react',
    })

    expect(
      placeholderData(
        previousData,
        makePreviousQuery({
          cityIds,
          limit: 20,
          q: 'react',
        }),
      ),
    ).toBeUndefined()
  })
})
