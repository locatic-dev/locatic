import { describe, expect, it } from 'vitest'

import type { Id } from '../../_generated/dataModel'
import { isUserDiscoverableInExplore } from '../discoverability'
import type { Doc } from '../types'
import {
  getMemberCityId,
  getRegionLabel,
  isCityMember,
  resolveLocationDisclosure,
  toPublicIdentity,
  toSnapshotLocation,
  type DisclosureCity,
} from '../visibility'

type CityVisibility = Doc<'users'>['privacy']['cityVisibility']

const bengaluruId = 'cities_bengaluru' as Id<'cities'>
const berlinId = 'cities_berlin' as Id<'cities'>

const bengaluru: DisclosureCity = {
  _id: bengaluruId,
  name: 'Bengaluru',
  displayName: 'Bengaluru, Karnataka, India',
  region: 'Karnataka',
  country: 'India',
}

const berlin: DisclosureCity = {
  _id: berlinId,
  name: 'Berlin',
  displayName: 'Berlin, State of Berlin, Germany',
  region: 'State of Berlin',
  country: 'Germany',
}

function makeUser({
  cityVisibility,
  appearInExplore = true,
  cityId = bengaluruId,
}: {
  cityVisibility: CityVisibility
  appearInExplore?: boolean
  cityId?: Id<'cities'> | null
}) {
  return {
    _id: 'users_1' as Id<'users'>,
    appearInExplore,
    deletedAt: null,
    deactivatedAt: null,
    github: { id: 1, username: 'mira' },
    profile: {
      displayName: 'Mira',
      avatarUrl: 'https://avatars.example.test/mira.png',
      buildStatus: 'open_to_collab' as const,
      cityId,
    },
    privacy: { cityVisibility },
  } as unknown as Doc<'users'>
}

const VISIBILITIES: CityVisibility[] = ['exact_city', 'region_only', 'hidden']

describe('visibility policy', () => {
  describe.each([true, false])('appearInExplore %s', (appearInExplore) => {
    it.each(VISIBILITIES)(
      '%s: disclosure and membership do not depend on discovery participation',
      (cityVisibility) => {
        const user = makeUser({ cityVisibility, appearInExplore })
        const disclosure = resolveLocationDisclosure(user, bengaluru)

        if (cityVisibility === 'exact_city') {
          expect(disclosure).toEqual({
            kind: 'city',
            cityId: bengaluruId,
            cityName: 'Bengaluru, Karnataka, India',
            regionLabel: 'Karnataka, India',
          })
          expect(isCityMember(user)).toBe(true)
          expect(isCityMember(user, bengaluruId)).toBe(true)
          expect(getMemberCityId(user)).toBe(bengaluruId)
        } else if (cityVisibility === 'region_only') {
          expect(disclosure).toEqual({
            kind: 'region',
            regionLabel: 'Karnataka, India',
          })
          expect(isCityMember(user)).toBe(false)
          expect(getMemberCityId(user)).toBeNull()
        } else {
          expect(disclosure).toEqual({ kind: 'none' })
          expect(isCityMember(user)).toBe(false)
          expect(getMemberCityId(user)).toBeNull()
        }

        // Participation is the separate discovery gate.
        expect(isUserDiscoverableInExplore(user)).toBe(appearInExplore)
      },
    )
  })

  it('never puts a city id or exact city name in region or none disclosures', () => {
    for (const cityVisibility of ['region_only', 'hidden'] as const) {
      const disclosure = resolveLocationDisclosure(
        makeUser({ cityVisibility }),
        bengaluru,
      )
      expect(disclosure).not.toHaveProperty('cityId')
      expect(disclosure).not.toHaveProperty('cityName')
      expect(JSON.stringify(disclosure)).not.toContain('Bengaluru')
    }
  })

  it('checks membership against a specific city', () => {
    const user = makeUser({ cityVisibility: 'exact_city' })
    expect(isCityMember(user, berlinId)).toBe(false)
    expect(isCityMember(user, String(bengaluruId))).toBe(true)
  })

  it('discloses nothing for a user without a city, a missing city or a mismatched city', () => {
    const cityless = makeUser({ cityVisibility: 'exact_city', cityId: null })
    expect(resolveLocationDisclosure(cityless, bengaluru)).toEqual({
      kind: 'none',
    })
    expect(isCityMember(cityless)).toBe(false)

    const user = makeUser({ cityVisibility: 'exact_city' })
    expect(resolveLocationDisclosure(user, null)).toEqual({ kind: 'none' })
    expect(resolveLocationDisclosure(user, berlin)).toEqual({ kind: 'none' })
  })

  it('uses only the country when the region would name the city', () => {
    expect(getRegionLabel(berlin)).toBe('Germany')
    expect(
      resolveLocationDisclosure(
        makeUser({ cityVisibility: 'region_only', cityId: berlinId }),
        berlin,
      ),
    ).toEqual({ kind: 'region', regionLabel: 'Germany' })
  })

  // Rows copied from the city catalogue (scripts/generated-cities.jsonl, by
  // slug): regions that name the city in longer words, and countries that
  // are the city.
  const catalogueCity = (
    slug: string,
    name: string,
    region: string | null,
    country: string,
  ): DisclosureCity => ({
    _id: `cities_${slug}` as Id<'cities'>,
    name,
    displayName: [name, region, country].filter(Boolean).join(', '),
    region,
    country,
  })

  it.each([
    [
      catalogueCity('berlin-de', 'Berlin', 'State of Berlin', 'Germany'),
      'Germany',
    ],
    [
      catalogueCity('vienna-at', 'Vienna', 'State of Vienna', 'Austria'),
      'Austria',
    ],
    [catalogueCity('kyiv-ua', 'Kyiv', 'Kyiv City', 'Ukraine'), 'Ukraine'],
    [
      catalogueCity('brussels-be', 'Brussels', 'Brussels Capital', 'Belgium'),
      'Belgium',
    ],
    [
      catalogueCity(
        'buenos-aires-ar',
        'Buenos Aires',
        'Buenos Aires F.D.',
        'Argentina',
      ),
      'Argentina',
    ],
    [
      catalogueCity(
        'chisinau-md',
        'Chisinau',
        'Chișinău Municipality',
        'Moldova',
      ),
      'Moldova',
    ],
    [
      catalogueCity('vienna-us', 'Vienna', 'Virginia', 'United States'),
      'Virginia, United States',
    ],
  ])('drops a region that names the city: %s', (city, label) => {
    expect(getRegionLabel(city)).toBe(label)
    const disclosure = resolveLocationDisclosure(
      makeUser({ cityVisibility: 'region_only', cityId: city._id }),
      city,
    )
    expect(disclosure).toEqual({ kind: 'region', regionLabel: label })
    expect(JSON.stringify(disclosure).toLowerCase()).not.toContain(
      city.name.toLowerCase(),
    )
  })

  it.each([
    catalogueCity('singapore-sg', 'Singapore', null, 'Singapore'),
    catalogueCity('monaco-mc', 'Monaco', 'Municipality of Monaco', 'Monaco'),
    catalogueCity('luxembourg-lu', 'Luxembourg', 'Luxembourg', 'Luxembourg'),
    catalogueCity('hong-kong-hk', 'Hong Kong', null, 'Hong Kong SAR China'),
  ])(
    'discloses nothing region-only when every label names the city: %s',
    (city) => {
      expect(getRegionLabel(city)).toBeNull()
      expect(
        resolveLocationDisclosure(
          makeUser({ cityVisibility: 'region_only', cityId: city._id }),
          city,
        ),
      ).toEqual({ kind: 'none' })
      // Exact-city users still disclose the city, with no region label.
      expect(
        resolveLocationDisclosure(
          makeUser({ cityVisibility: 'exact_city', cityId: city._id }),
          city,
        ),
      ).toMatchObject({ kind: 'city', regionLabel: null })
    },
  )

  it('matches whole words only', () => {
    expect(
      getRegionLabel(catalogueCity('ur-xx', 'Ur', 'Urban District', 'Iraq')),
    ).toBe('Urban District, Iraq')
  })

  it('encodes disclosures for stored snapshots without leaking the city', () => {
    const snapshotFor = (cityVisibility: CityVisibility) =>
      toSnapshotLocation(
        resolveLocationDisclosure(makeUser({ cityVisibility }), bengaluru),
      )

    expect(snapshotFor('exact_city')).toEqual({
      cityId: bengaluruId,
      cityName: 'Bengaluru, Karnataka, India',
    })
    expect(snapshotFor('region_only')).toEqual({
      cityId: null,
      cityName: 'Karnataka, India',
    })
    expect(snapshotFor('hidden')).toEqual({ cityId: null, cityName: null })
  })

  it('projects a public identity with the disclosure and no raw profile city', () => {
    const cityById = new Map([[String(bengaluruId), bengaluru]])
    const identity = toPublicIdentity(
      makeUser({ cityVisibility: 'hidden' }),
      cityById,
    )

    expect(identity).toEqual({
      userId: 'users_1',
      displayName: 'Mira',
      avatarUrl: 'https://avatars.example.test/mira.png',
      githubUsername: 'mira',
      buildStatus: 'open_to_collab',
      location: { kind: 'none' },
    })
    expect(
      toPublicIdentity(makeUser({ cityVisibility: 'exact_city' }), cityById)
        .location,
    ).toMatchObject({ kind: 'city', cityId: bengaluruId })
  })
})
