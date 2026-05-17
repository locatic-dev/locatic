import { internalMutation, query } from './_generated/server'
import { v } from 'convex/values'

import { DEFAULT_CITIES } from './citiesSeed'

export const search = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 10, 20)
    const normalizedQuery = args.query.trim().toLowerCase()
    if (!normalizedQuery) {
      return (await ctx.db.query('cities').withIndex('by_name').take(40))
        .filter((city) => city.isActive)
        .slice(0, limit)
    }

    return await ctx.db
      .query('cities')
      .withSearchIndex('search_text', (query) =>
        query.search('searchText', normalizedQuery).eq('isActive', true),
      )
      .take(limit)
  },
})

export const listPopular = query({
  args: {},
  handler: async (ctx) => {
    return (await ctx.db.query('cities').withIndex('by_name').take(40))
      .filter((city) => city.isActive)
      .slice(0, 20)
  },
})

export const listByIds = query({
  args: {
    cityIds: v.array(v.id('cities')),
  },
  handler: async (ctx, args) => {
    const cities = await Promise.all(
      args.cityIds.map((cityId) => ctx.db.get(cityId)),
    )
    return cities.filter((city): city is NonNullable<typeof city> =>
      Boolean(city),
    )
  },
})

export const seedDefaultCities = internalMutation({
  args: {},
  handler: async (ctx) => {
    let created = 0
    const now = Date.now()

    for (const city of DEFAULT_CITIES) {
      const existing = await ctx.db
        .query('cities')
        .withIndex('by_slug', (query) => query.eq('slug', city.slug))
        .unique()

      if (existing) {
        continue
      }

      await ctx.db.insert('cities', {
        slug: city.slug,
        name: city.name,
        displayName: city.displayName,
        normalizedName: city.displayName.toLowerCase(),
        region: city.region,
        country: city.country,
        countryCode: city.countryCode,
        location: {
          lat: city.lat,
          lng: city.lng,
        },
        address: city.address,
        aliases: city.aliases,
        timezone: city.timezone,
        searchText: [city.displayName, city.name, ...city.aliases].join(' '),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })

      created += 1
    }

    return { created }
  },
})
