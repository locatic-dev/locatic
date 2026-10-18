import { describe, expect, it } from 'vitest'

async function runLoader(slug: string, page: unknown) {
  const { Route } = await import('@/routes/c.$slug')
  const loader = Route.options.loader as (args: unknown) => Promise<unknown>
  return await loader({
    context: { queryClient: { ensureQueryData: async () => page } },
    params: { slug },
  })
}

const page = {
  city: {
    cityId: 'city_mysuru',
    slug: 'mysuru-in',
    name: 'Mysuru',
    displayName: 'Mysuru, Karnataka, India',
    location: { lat: 12.3, lng: 76.6 },
  },
  stats: { builderCount: 3, projectCount: 2, lastActivityAt: null },
  recentWork: {
    projects: [
      {
        primaryLanguage: 'Go',
        owner: 'ada',
        repo: 'engine',
        fullName: 'ada/engine',
      },
    ],
    hasMore: false,
  },
}

describe('/c/$slug loader', () => {
  it('throws notFound for an unknown or inactive city', async () => {
    await expect(runLoader('atlantis-xx', null)).rejects.toEqual({
      isNotFound: true,
    })
  })

  it('redirects a city id to the canonical slug', async () => {
    await expect(runLoader('city_mysuru', page)).rejects.toMatchObject({
      options: {
        to: '/c/$slug',
        params: { slug: 'mysuru-in' },
        replace: true,
        statusCode: 301,
      },
    })
  })

  it('loads the page title and canonical slug for a slug', async () => {
    await expect(runLoader('mysuru-in', page)).resolves.toEqual({
      name: 'Mysuru',
      displayName: 'Mysuru, Karnataka, India',
      slug: 'mysuru-in',
      location: { lat: 12.3, lng: 76.6 },
      projects: [{ owner: 'ada', repo: 'engine', fullName: 'ada/engine' }],
      builderCount: 3,
      summary:
        '3 builders in Mysuru share 2 public projects on Locatic. Recent work is mostly Go.',
    })
  })
})
