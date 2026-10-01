import { describe, expect, it } from 'vitest'

import type { Id } from '../../_generated/dataModel'
import {
  clampCitySearchLimit,
  foldCityText,
  getCityMatchTier,
  normalizeCitySearchQuery,
  rankCitySearchResults,
  type CitySearchCandidate,
} from '../citySearch'

function city(
  name: string,
  displayName: string,
  aliases: string[] = [],
  overrides: Partial<CitySearchCandidate> = {},
): CitySearchCandidate {
  return {
    _id: `cities_${displayName}` as Id<'cities'>,
    name,
    displayName,
    normalizedName: displayName.toLowerCase(),
    aliases,
    isActive: true,
    ...overrides,
  }
}

const berlin = city('Berlin', 'Berlin, State of Berlin, Germany')
const bern = city('Bern', 'Bern, Bern, Switzerland')
const berdychiv = city('Berdychiv', 'Berdychiv, Zhytomyr Oblast, Ukraine')
const bneiBrak = city('Bnei Brak', 'Bnei Brak, Tel Aviv, Israel', [
  'bene berak',
])
const newYork = city('New York', 'New York, New York, United States', ['nyc'])
const zurich = city('Zürich', 'Zürich, Zurich, Switzerland', ['zurich'])

describe('normalizeCitySearchQuery', () => {
  it('trims, lowercases and collapses whitespace like normalizedName', () => {
    expect(normalizeCitySearchQuery('  New   York ')).toBe('new york')
    expect(normalizeCitySearchQuery('Zürich')).toBe('zürich')
  })
})

describe('foldCityText', () => {
  it('folds diacritics after lowercasing', () => {
    expect(foldCityText(' Zürich ')).toBe('zurich')
    expect(foldCityText('São Paulo')).toBe('sao paulo')
  })
})

describe('clampCitySearchLimit', () => {
  it('defaults to 8 and stays within 1..20', () => {
    expect(clampCitySearchLimit(undefined)).toBe(8)
    expect(clampCitySearchLimit(0)).toBe(1)
    expect(clampCitySearchLimit(50)).toBe(20)
    expect(clampCitySearchLimit(Number.NaN)).toBe(8)
  })
})

describe('getCityMatchTier', () => {
  it('classifies each match kind', () => {
    expect(getCityMatchTier('berlin', berlin)).toBe('exact_name')
    expect(getCityMatchTier('berlin, state of berlin, germany', berlin)).toBe(
      'exact_name',
    )
    expect(getCityMatchTier('nyc', newYork)).toBe('exact_alias')
    expect(getCityMatchTier('ber', berlin)).toBe('name_prefix')
    expect(getCityMatchTier('berlin, st', berlin)).toBe('name_prefix')
    expect(getCityMatchTier('bene', bneiBrak)).toBe('alias_prefix')
    expect(getCityMatchTier('ber', bneiBrak)).toBe('text')
  })

  it('matches names regardless of diacritics', () => {
    expect(getCityMatchTier('zurich', zurich)).toBe('exact_name')
    expect(getCityMatchTier('zur', zurich)).toBe('name_prefix')
  })
})

describe('rankCitySearchResults', () => {
  const names = (rows: CitySearchCandidate[]) => rows.map((row) => row.name)

  it('puts name prefixes before fuzzy text hits, shortest name first', () => {
    // Input in the order the full-text index returned them.
    expect(
      names(
        rankCitySearchResults('ber', [berdychiv, bneiBrak, berlin, bern], 8),
      ),
    ).toEqual(['Bern', 'Berlin', 'Berdychiv', 'Bnei Brak'])
  })

  it('puts an exact name before longer prefixes and shorter text hits', () => {
    const berlingen = city('Berlingen', 'Berlingen, Thurgau, Switzerland')
    expect(
      names(rankCitySearchResults('Berlin', [berlingen, bern, berlin], 8)),
    ).toEqual(['Berlin', 'Berlingen', 'Bern'])
  })

  it('ranks exact names, exact aliases, name prefixes, alias prefixes, text', () => {
    const york = city('York', 'York, England, United Kingdom')
    const yorkton = city('Yorkton', 'Yorkton, Saskatchewan, Canada')
    const newYorkMills = city(
      'New York Mills',
      'New York Mills, Minnesota, United States',
    )
    const aliasExact = city('Eboracum', 'Eboracum, Somewhere, Nowhere', [
      'york',
    ])
    const aliasPrefix = city('Jorvik', 'Jorvik, Somewhere, Nowhere', [
      'yorkshire town',
    ])
    expect(
      names(
        rankCitySearchResults(
          'york',
          [newYorkMills, aliasPrefix, yorkton, aliasExact, newYork, york],
          8,
        ),
      ),
    ).toEqual([
      'York',
      'Eboracum',
      'Yorkton',
      'Jorvik',
      'New York',
      'New York Mills',
    ])
  })

  it('orders same-name cities by display name so both stay distinguishable', () => {
    const hyderabadIn = city('Hyderabad', 'Hyderabad, Telangana, India')
    const hyderabadPk = city('Hyderabad', 'Hyderabad, Sindh, Pakistan')
    expect(
      rankCitySearchResults('hyderabad', [hyderabadIn, hyderabadPk], 8).map(
        (row) => row.displayName,
      ),
    ).toEqual(['Hyderabad, Sindh, Pakistan', 'Hyderabad, Telangana, India'])
  })

  it('drops inactive rows and duplicate ids, and respects the limit', () => {
    const inactive = city('Bernau', 'Bernau, Brandenburg, Germany', [], {
      isActive: false,
    })
    expect(
      names(rankCitySearchResults('ber', [berlin, inactive, berlin, bern], 8)),
    ).toEqual(['Bern', 'Berlin'])
    expect(
      names(rankCitySearchResults('ber', [berdychiv, berlin, bern], 2)),
    ).toEqual(['Bern', 'Berlin'])
  })

  it('ranks prefix and text matches by builders, then projects, then name', () => {
    const stats = (builderCount: number, projectCount: number) => ({
      stats: { builderCount, projectCount, lastActivityAt: null },
    })
    const bergen = city('Bergen', 'Bergen, Vestland, Norway', [], stats(0, 5))
    const berlinActive = city(
      'Berlin',
      'Berlin, State of Berlin, Germany',
      [],
      stats(3, 1),
    )
    const berlingen = city(
      'Berlingen',
      'Berlingen, Thurgau, Switzerland',
      [],
      stats(3, 2),
    )
    const activeText = city('Bnei Brak', 'Bnei Brak, Tel Aviv, Israel', [
      'bene berak',
    ])
    expect(
      names(
        rankCitySearchResults(
          'ber',
          [bern, bergen, berlinActive, activeText, berlingen],
          8,
        ),
      ),
    ).toEqual(['Berlingen', 'Berlin', 'Bergen', 'Bern', 'Bnei Brak'])
  })

  it('keeps exact matches first whatever the activity', () => {
    const busyBerlingen = city(
      'Berlingen',
      'Berlingen, Thurgau, Switzerland',
      [],
      { stats: { builderCount: 50, projectCount: 50, lastActivityAt: null } },
    )
    expect(
      names(rankCitySearchResults('berlin', [busyBerlingen, berlin], 8)),
    ).toEqual(['Berlin', 'Berlingen'])
  })

  it('returns nothing for a blank query', () => {
    expect(rankCitySearchResults('   ', [berlin], 8)).toEqual([])
  })
})
