import { convexTest, type TestConvex } from 'convex-test'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Id } from '../../_generated/dataModel'
import schema from '../../schema'
import {
  seedCities,
  seedPrivacyVariants,
  seedProject,
  seedUser,
  type PrivacyVariantKey,
  type SeededCities,
} from '../../__tests__/fixtures.helpers'
import {
  buildProjectCardPreview,
  type ProjectCardPreviewAudience,
} from '../project_previews'

const modules = import.meta.glob('../../**/*.ts')

async function previewLocation(
  t: TestConvex<typeof schema>,
  projectId: Id<'projects'>,
  audience: ProjectCardPreviewAudience = 'public',
) {
  return await t.run(async (ctx) => {
    const project = await ctx.db.get(projectId)
    const { cityLabel, cityVisibilityState } = await buildProjectCardPreview(
      ctx.db,
      project!,
      { audience },
    )
    return { cityLabel, cityVisibilityState }
  })
}

describe('project card preview location', () => {
  let t: TestConvex<typeof schema>
  let cities: SeededCities

  beforeEach(async () => {
    t = convexTest(schema, modules)
    cities = await seedCities(t)
  })

  async function variantLocations(cityId: Id<'cities'>) {
    const { projects } = await seedPrivacyVariants(t, cityId)
    const location = (key: PrivacyVariantKey) =>
      previewLocation(t, projects[key])
    return {
      exact: await location('exact_city:explore'),
      region: await location('region_only:explore'),
      hidden: await location('hidden:explore'),
    }
  }

  it('discloses the exact city, the region label from the city record, or nothing', async () => {
    expect(await variantLocations(cities.bengaluru)).toEqual({
      exact: {
        cityLabel: 'Bengaluru, Karnataka, India',
        cityVisibilityState: 'exact_city',
      },
      region: {
        cityLabel: 'Karnataka, India',
        cityVisibilityState: 'region_only',
      },
      hidden: { cityLabel: null, cityVisibilityState: 'hidden' },
    })
  })

  it('labels a region-only owner in a city-state by country only', async () => {
    const { region } = await variantLocations(cities.berlin)

    // Splitting "Berlin, Berlin, Germany" used to yield "Berlin, Germany".
    expect(region).toEqual({
      cityLabel: 'Germany',
      cityVisibilityState: 'region_only',
    })
  })

  it('reports unset when the owner has no city', async () => {
    const ownerId = await seedUser(t, { username: 'no-city', cityId: null })
    const projectId = await seedProject(t, { ownerId, name: 'no-city-app' })

    expect(await previewLocation(t, projectId)).toEqual({
      cityLabel: null,
      cityVisibilityState: 'unset',
    })
  })

  it('shows owners their own exact city on private previews', async () => {
    const ownerId = await seedUser(t, {
      username: 'hidden-owner',
      cityId: cities.berlin,
      cityVisibility: 'hidden',
    })
    const projectId = await seedProject(t, { ownerId, name: 'own-app' })

    expect(await previewLocation(t, projectId, 'private')).toEqual({
      cityLabel: 'Berlin, State of Berlin, Germany',
      cityVisibilityState: 'exact_city',
    })
  })
})
