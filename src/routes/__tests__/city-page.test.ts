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
      options: { to: '/c/$slug', params: { slug: 'mysuru-in' }, replace: true },
    })
  })

  it('loads the page title for a slug', async () => {
    await expect(runLoader('mysuru-in', page)).resolves.toEqual({
      name: 'Mysuru',
      displayName: 'Mysuru, Karnataka, India',
    })
  })
})
