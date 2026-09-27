import { describe, expect, it } from 'vitest'

import {
  EXPLORE_MAX_SELECTED_CITIES,
  getCanonicalExploreCityIds,
  isConvexIdShape,
  normalizeExploreSearch,
} from '../state'

// Shaped like real Convex ids (31–37 lowercase base32 characters).
const cityId = (n: number) =>
  `k57b3r9v6x2m1c0d8e4f5g6h7j8n9p${String(n).padStart(2, '0')}`

describe('selected city ids from the URL', () => {
  it('keeps only values shaped like Convex ids', () => {
    expect(
      normalizeExploreSearch({
        scope: 'custom',
        selectedCityIds: [
          cityId(1),
          'city_1',
          '<script>',
          '../../etc',
          'A'.repeat(32),
          'a'.repeat(41),
          42,
          null,
        ],
      }).selectedCityIds,
    ).toEqual([cityId(1)])
  })

  it('falls back to global when nothing valid remains', () => {
    expect(
      normalizeExploreSearch({ scope: 'custom', selectedCityIds: ['nope'] }),
    ).toMatchObject({ scope: 'global', selectedCityIds: [] })
  })

  it(`caps a shared URL at ${EXPLORE_MAX_SELECTED_CITIES} cities`, () => {
    const ids = Array.from({ length: 15 }, (_, index) => cityId(index))

    expect(
      normalizeExploreSearch({ scope: 'custom', selectedCityIds: ids })
        .selectedCityIds,
    ).toEqual(ids.slice(0, EXPLORE_MAX_SELECTED_CITIES))
  })

  it('recognises the id shape', () => {
    expect(isConvexIdShape(cityId(1))).toBe(true)
    expect(isConvexIdShape('city_1')).toBe(false)
    expect(isConvexIdShape(undefined)).toBe(false)
  })
})

describe('getCanonicalExploreCityIds', () => {
  const berlin = {
    _id: cityId(1),
    countryCode: 'DE',
    name: 'Berlin',
    displayName: 'Berlin, Germany',
  }

  it('keeps an unknown id while the cities are loading', () => {
    expect(getCanonicalExploreCityIds([cityId(1), cityId(2)], [])).toEqual([
      cityId(1),
      cityId(2),
    ])
  })

  it('drops ids that named no city once the lookup has answered', () => {
    expect(
      getCanonicalExploreCityIds([cityId(1), cityId(2)], [berlin], {
        dropUnresolved: true,
      }),
    ).toEqual([cityId(1)])
    expect(
      getCanonicalExploreCityIds([cityId(2)], [], { dropUnresolved: true }),
    ).toEqual([])
  })
})
